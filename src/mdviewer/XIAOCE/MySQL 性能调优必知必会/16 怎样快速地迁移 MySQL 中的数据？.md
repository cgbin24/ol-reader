我们通常会遇到这样的一个场景，就是需要将一个数据库的数据迁移到一个性能更加强悍的数据库服务器上。这个时候需要我们做的就是快速迁移数据库的数据。

那么，如何才能快速地迁移数据库中的数据呢？今天我们就来聊一聊这个话题。

数据库的数据迁移无外乎有两种方式，一种是**物理迁移**，另一种则是**逻辑迁移**。

首先，我们生成 5 万条测试数据。具体如下：
```sql
-- 1. 准备表
create table s1(
  id int,
  name varchar(20),
  gender char(6),
  email varchar(50)
);

-- 2. 创建存储过程，实现批量插入记录
delimiter $$
create procedure auto_insert1()
BEGIN
    declare i int default 1;
    while(i<50000)do
        insert into s1 values(i,'shanhe','male',concat('shanhe',i,'@helloworld'));
        set i=i+1;
        select concat('shanhe',i,'_ok');
    end while;
END$$
delimiter ;

-- 3. 查看存储过程
show create procedure auto_insert1\G 

-- 4. 调用存储过程
call auto_insert1()
```

### 逻辑迁移

逻辑迁移的原理是**根据 MySQL 数据库中的数据和表结构转换成 SQL 文件**。采用这一原理常用的迁移工具有 `mysqldump`。

下面我们就来测试一下：
```sql
[root@dxd ~]# mysqldump -h172.17.16.2 -uroot -pTest123!  s1 s1 --result-file=/opt/s1.sql

[root@dxd ~]# ll /opt/
-rw-r--r--  1 root root 2684599 5月  10 00:24 s1.sql
```

我们可以看到的是，生成了相应的 SQL 。现在我们通过生成的 SQL 迁移到另一个数据库中。
```sql
mysql> use s2;
Database changed

mysql> source /opt/s1.sql
```

通过简单的时间累加计算，大约消耗了 1 秒钟的时间，但是随着数据库递增，迁移的时长也会相应地增加。此时，如果需要迁移的数据表中的数据足够大（假设上千万条），mysqldump 很有可能会将内存撑爆进而导致迁移失败。所以，在迁移这样的数据表的时候，我们可以简单优化一下 mysqldump ，具体如下。

- `--add-locks=0`：这个参数表示在迁移数据的时候不加 `LOCK TABLES s1.s1 WRITE;`，也就是说在导入数据时不锁定数据表。
- `--single-transaction`：表示的是在导出数据时，不锁定数据表。
- `--set-gtid-purged=OFF`：表示在导入数据时，不输出 GTID 相关的信息。

加上这三个参数主要是为了减少所有的操作导致不必要的 IO ，具体如下：
```sql
[root@dxd ~]# mysqldump -h172.17.16.2 -uroot -pTest123! --add-locks=0 --single-transaction --set-gtid-purged=OFF s1 s1 --result-file=/opt/s1.sql
```

通过上面的案例，我们看最终结果，优化的效果微乎其微。所以，这种逻辑优化的方式，在数据量比较大的情况下（百万条以上）不可取。

### 文件迁移

文件迁移顾名思义就是**直接迁移数据库的存储文件**。这种迁移方式相对于逻辑迁移的方式来说，性能上要高出很多，同时也很少会把内存撑爆；`在面对数据量较大的场景下迁移数据，建议使用文件迁移的方式`，具体如下：
```sql
mysql> select * from s1 into outfile '/var/lib/mysql-files/1.txt';
Query OK, 55202 rows affected (0.04 sec)
```

我们可以看到的是，将 5 万多条数据导出到文件中时，只花了 0.04 秒左右的时间。相比较 mysqldump 来说快了一倍多。

> 注意：这种方式导出的数据只能导出到 MySQL 数据库的目录中。配置这个目录的参数是 `secure_file_priv`，如果不这样做，数据库会报一个 `ERROR 1290 (HY000): The MySQL server is running with the --secure-file-priv option so it cannot execute this statement` 的错误。

导出数据之后，我们再将该文件中的数据导入到数据库中，看一下效果，具体如下：
```sql
mysql> load data infile '/var/lib/mysql-files/1.txt' into table s3.s1;
Query OK, 55202 rows affected (0.27 sec)
Records: 55202  Deleted: 0  Skipped: 0  Warnings: 0
```

> 注意：into outfile 是不会生成表结构的，因此在导入数据之前，需要手动创建表结构。

我们可以看出，导入花费的时间总共是`0.27`秒，相比较 mysqldump 而言，也要快两倍多。

这种方式主要是将每一条数据都以`\n`换行的方式直接保存在文件之中。

导入的时候，首先会判断导入的数据表的字段是否与每一行的数据的列数一致，如果一致则一行一行地导入，如果不一致则直接报错。

这里面有一个问题需要我们注意，如果我们的数据库是主从架构的数据库，这里很可能就会产生一个问题。讲这个问题之前，我们得首先在这里稍微说明一下主从复制的原理。

主从复制的原理主要是依赖于 `binlog` 日志，`binlog` 日志具体步骤如下：

- 主库上执行 SQL ，并且把修改的数据保存在 binlog 日志之中；
- 由主库上的 dump 线程转发给从库；
- 由从库中的 IO 线程接收主库发送过来的 binlog 日志；
- 将 binlog 日志数据写入中继日志之中；
- 通过从库上的 SQL 线程从中继日志中重放 binlog 日志，进而达到主从数据一致。

在这个过程之中，我相信仔细阅读本小册第 15 篇文章的朋友一定有一个疑问，当 binlog 日志的工作模式为 `STATEMENT` 时，在主库上执行上面的 `SQL load data infile '/var/lib/mysql-files/1.txt' into table s3.s1;` 时，就会导致从库无法重复上方 SQL 的结果，这是因为从库中并没有 `/var/lib/mysql-files/1.txt` 这个文件。具体步骤如下：

1. 主库执行 load data infile '/var/lib/mysql-files/1.txt' into table s3.s1;；
2. binlog 日志的工作模式如果是 STATEMENT 时，将在 binlog 中记录上方的 SQL；
3. 然后在从库中重新执行 binlog 中记录上方的 SQL。

很显然，从库上执行该 SQL 时，会立即报错，这个时候怎么办呢？

这个时候我需要再介绍上方 SQL 的 load 关键字：

- 如果增加 local 关键字，则该条 SQL 会在本地寻找 `/var/lib/mysql-files/1.txt`；
- 如果不加 local 关键字，则该条 SQL 会在主库端寻找 `/var/lib/mysql-files/1.txt`。

所以，在主从架构中，要使用文件迁移的方式迁移数据，不加 local 关键字即可。

### 物理迁移

物理迁移也是迁移文件，所不同是物理迁移一般是直接迁移 MySQL 的数据文件。这种迁移方式性能很好但是操作过程麻烦，容易出错。具体我们来详细解释一下

首先是非常干脆的迁移方式迁移，就是直接 MySQL 数据库的数据文件打包迁移，下面我们做一个案例：
```sql
-- 我们将s1数据库中的所有数据迁移到s4数据库之中
[root@dxd mysql]# pwd
/var/lib/mysql
[root@dxd mysql]# cp -r s1 s4
[root@dxd mysql]# chown -R mysql.mysql s4

-- 重启数据库
[root@dxd mysql]# systemctl restart mysqld

-- 查看该表数据
mysql> select count(*) from s1;
ERROR 1146 (42S02): Table 's4.s1' doesn't exist
```

我们可以看到的是查询数据的时候报了一个 `1146` 的错误，这是因为 INnoDB 存储引擎中的数据表是需要在 MySQL 数据库的数据字典中注册的，我们直接将数据文件复制过去的时候并没有在数据字典中注册，换句话说就是在把数据复制过去之后，还需要在数据字典中注册数据库系统才能正常识别。

下面我们就来介绍一下在数据字典中该如何注册，具体步骤如下。

> 注：物理迁移数据表数据实际上最主要的就是迁移表空间，因为对于 InnoDB 存储引擎来说，数据是存储在数据表空间中的，也就是`.idb`文件。

1. 我们在迁移到的数据库中创建与需要迁移的数据表完全相同的数据表。

```sql
mysql> create database t1;
Query OK, 1 row affected (0.01 sec)

mysql> use t1;
Database changed

mysql> CREATE TABLE `s1` (
    ->   `id` int(11) DEFAULT NULL,
    ->   `name` varchar(20) DEFAULT NULL,
    ->   `gender` char(6) DEFAULT NULL,
    ->   `email` varchar(50) DEFAULT NULL
    -> ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
Query OK, 0 rows affected (0.04 sec)
```

2. 删除新创建的数据表的表空间，这是因为新创建的数据库的表空间没有数据且会跟迁移过来的数据表空间冲突，我们提前删除，具体删除步骤如下：

```sql
mysql> alter table t1.s1 discard tablespace;
Query OK, 0 rows affected (0.01 sec)
```

3. 创建一个原有数据表的配置文件，这样做的目的是将原有数据表的一些配置复制过来（注意：这一步会自动将数据表上锁）。

```sql
mysql> use s1;
Database changed

mysql> flush table s1 for export;
Query OK, 0 rows affected (0.01 sec)

# 查看是否已经创建 .cfg 文件
[root@dxd mysql]# pwd
/var/lib/mysql
[root@dxd mysql]# ll s1/
总用量 12312
-rw-r----- 1 mysql mysql       65 5月  10 00:26 db.opt
-rw-r----- 1 mysql mysql      520 5月  10 15:15 s1.cfg
-rw-r----- 1 mysql mysql     8652 5月  10 00:27 s1.frm
-rw-r----- 1 mysql mysql 12582912 5月  10 00:27 s1.ibd
```

4. 将配置文件和表空间文件迁移至新的数据库。

```sql
# 复制文件的方式可以灵活多变
[root@dxd mysql]# cp s1/s1.cfg t1/
[root@dxd mysql]# cp s1/s1.ibd t1/

# 设置权限，很重要，如果权限不一致会导致数据读取表空间数据失败
[root@dxd mysql]# chown -R mysql.mysql t1/
```

5. 将原有数据表解锁。

```sql
mysql> use s1;
Database changed

mysql> unlock tables;
Query OK, 0 rows affected (0.00 sec)
```

6. 载入新的表空间。

```sql
mysql> use t1;

mysql> alter table s1 import tablespace;
Query OK, 0 rows affected (0.09 sec)
```

7. 测试。

```sql
mysql> select count(*) from s1;
+----------+
| count(*) |
+----------+
|    55202 |
+----------+
1 row in set (0.03 sec)
```

我们看到此时就实现了数据迁移。

这种数据迁移虽然性能很好，但是过程非常麻烦，很容易出现操作失误的情况。

### 总结

今天，我们介绍了三种数据库迁移的方式，分别是：逻辑迁移、文件迁移和物理迁移。

逻辑迁移的方式主要是使用 `mysqldump` 命令进行迁移，其原理主要是将数据库中的数据和结构生成 SQL 文件，再导入即可。这种迁移方式主要适用于**数据量比较小且服务器性能较好**的场景下，例如数据连少于 500 万条以下的场景。

`文件迁移的方式其实也算是逻辑迁移的范畴`，它主要通过命令将数据保存在文件中，然后再导入数据库即可，这种迁移方式是不会迁移表结构的，所以在导入数据之前需要手动创建表结构，其原理跟逻辑迁移的方式相同。

物理迁移的方式适用于**数据量比较大**的场景，这种场景不易导致服务器因资源占用过多而宕机，但是操作过程麻烦且会锁定原数据表。

在实际应用过程中，我们通常选择使用 mysqldump 的方式进行数据迁移；如果数据量大，我们首选方式应该是提升服务器的性能，以至于它能够承载处理相应数据量的性能；如果必须迁移，可以考虑使用第三方专业的数据迁移工具。