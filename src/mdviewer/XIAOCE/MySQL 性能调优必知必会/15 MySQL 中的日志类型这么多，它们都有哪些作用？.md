我经常在面试别人的时候，特别喜欢问一些生产性的问题。例如：如果数据库偶发性地变慢，你该如何排查？再例如，数据库主从复制突然延时增加，你又怎么排查呢？

问这种问题最主要的原因是想考验一下面试者在工作中处理问题的能力，这种能力只能够是在足够了解一个事物原理的基础上才能拥有。并且在日常的工作当中或者在面试大厂的时候，也经常会遇到类似的问题。

那么遇到类似的问题该怎么解决呢？今天我们就来聊一聊这个话题。

通常，遇到一些未知的问题（类似于上述的两个问题）时，我们的第一反应是**查看日志**。那么这个时候问题又来了：该看什么日志呢？

在 MySQL 数据库当中，有很多种日志，每一种日志的作用都不尽相同。

### 错误日志

首先，我们介绍一下 MySQL 数据库中的错误日志，顾名思义主要是用来记录 MySQL 数据库中出现的错误或者警告的，下面我们来看一下它的位置。
```sql
mysql> show variables like '%log_error%';
+---------------------+---------------------+
| Variable_name       | Value               |
+---------------------+---------------------+
| log_error           | /var/log/mysqld.log |
+---------------------+---------------------+
3 rows in set (0.13 sec)
```

其中，`/var/log/mysqld.log` 就是 MySQL 数据库错误日志的路径。

如果，要想将错误信息写入到错误日志中，还受 MySQL 数据库中 `log_warnings` 参数的影响，该参数有三个参数，分别是 0、1 和大于 1 三个参数。下面我们将来证明这三个参数的作用，分别如下。

- 当 `log_warnings` 的结果为 **0** 时，不记录警告日志。

```sql
-- 设置为0
mysql> set GLOBAL log_warnings=0;
Query OK, 0 rows affected, 1 warning (0.00 sec)

-- 查看设置结果
mysql> show variables like '%log_warnings%';
+---------------+-------+
| Variable_name | Value |
+---------------+-------+
| log_warnings  | 0     |
+---------------+-------+
1 row in set (0.00 sec)

-- 使用明文密码，制造一个警告日志
[root@dxd ~]# mysql -uroot -pTest123! -h172.17.16.2

-- 查看错误日志
[root@dxd ~]# cat /var/log/mysqld.log
[root@dxd ~]#
```

我们可以看到，没有记录警告日志。

- 当 `log_warnings` 的结果为 **1** 时，记录错误日志，并且将警告日志也记录到错误日志之中。

```sql
-- 设置为 1
[root@dxd ~]# vim /etc/my.cnf
log_warnings=1

-- 查看设置结果
mysql> show variables like '%log_warnings%';
+---------------+-------+
| Variable_name | Value |
+---------------+-------+
| log_warnings  | 1     |
+---------------+-------+
1 row in set (0.00 sec)

-- 使用明文密码，制造一个警告日志
[root@dxd ~]# systemctl restart mysqld

[root@dxd ~]# tail -f /var/log/mysql/mysqld.log
2022-05-07T17:15:32.067933Z 0 [Warning] CA certificate ca.pem is self signed.
```

我们可以看到，重启 MySQL 数据库的时候，记录了警告日志。

- 当 `log_warnings` 的结果**大于 1** 时，除了记录警告日志和错误日志之外，还将连接失败的信息也记录到错误日志。

```sql
-- 设置为 2
[root@dxd ~]# vim /etc/my.cnf
log_warnings=2

-- 查看设置结果
mysql> show variables like '%log_warnings%';
+---------------+-------+
| Variable_name | Value |
+---------------+-------+
| log_warnings  | 2     |
+---------------+-------+
1 row in set (0.00 sec)

-- 连接一个不存在的 Master 节点，导致链接失败
mysql> change master to
    ->     master_host='192.168.15.61',
    ->     master_port=3306,
    ->     master_user='shanhe',
    ->     master_password='123456',
    ->     master_log_file='binlog.000002',
    ->     master_log_pos=1459;
Query OK, 0 rows affected, 1 warning (0.01 sec)

mysql> start slave;
Query OK, 0 rows affected (0.00 sec)

-- 查看链接错误日志
[root@dxd ~]# tail -f /var/log/mysql/mysqld.log
2022-05-08T14:23:46.278006Z 7 [ERROR] Slave I/O for channel '': error connecting to master 'shanhe@192.168.15.61:3306' - retry-time: 60  retries: 1, Error_code: 2003
```

我们可以看到，当链接失败时，记录了错误日志。

根据不同的配置，可以将不同类型的错误日志记录到错误日志文件之中，这样做的好处是能够在 MySQL 数据库发生异常时把相关的错误记录下来，方便后续排查。

### 事务日志

在第 10 篇文章中，我在介绍事务的时候提到过事务的原理、提到过事务的回滚和提交是借助于 `redo log` 和 `undo log` 两个日志，在这里我们就来回顾一下这两个日志。

`redo log` 的本质是**物理日志**，主要是用来保存 MySQL 数据库中新修改的脏数据。它主要分为以下两个部分。

- `redo log buffer`：内存中的`redo log`缓存，为什么需要这个缓存呢？举个例子：假设一个数据表中有`10W`条数据，需要增加一个字段并设置一个默认值时，这个时候也就意味着全表所有的数据同一时间发生了更新操作。如果没有`redo log buffer`的话，就需要同一时间操作硬盘，这样很可能会发生硬盘`IO`阻塞，进而导致数据库发生异常，所以`redo log buffer`最主要的工作就是一个**缓冲**的作用。

  这里有一点我们需要注意，`redo log buffer`是将数据保存在内存之中的，也就是说如果机器出现了宕机或者重启等操作的时候，`redo log buffer`中的数据就会随即丢失。为了防止这个问题的出现，MySQL 数据库又引入了`redo log file`。

- `redo log file`：将修改的数据保存在磁盘中的物理日志。当一个修改操作发生时，首先会将修改逻辑保存在 `redo log buffer`，然后再保存至`redo log file`中做持久化，这样做的好处是**哪怕数据库宕机或重启，数据也不会丢失**。

`undo log` 的本质是一个**逻辑日志**，主要是通过 MySQL 数据库中的 MVCC 机制来实现的（这里我们稍微解释一下 MVCC ，它主要为 MySQL 数据库中的一种快照）。`undo log` 日志通过 MVCC 机制的快照功能，把每一次数据库修改之前的数据拍摄一个快照，如果此次修改发生了回滚，则`undo log`日志会通过快照的方式将数据还原成原来的版本。这样做的好处是即保证了数据库的在回滚时的性能，又能够准确地回滚到原来的数据版本。

### 查询日志

查询日志（也叫一般查询日志）是 MySQL 数据库中的一种常见日志，它的功能是会**将数据库中所有的 SQL 操作全部记录下来**。这种方式可以非常便利地看到数据库中所有的 SQL 操作。但是这种日志通常情况下 MySQL 数据库是不会开启的，这主要是因为它把每一条 SQL 都记录下来的这一过程对于数据库的磁盘 IO 消耗非常大，不利于在高速运转的数据库上开启。一般我们在测试环境调试 MySQL 数据库的时候，为了方便看到数据库的每一步操作时才会开启查询日志。

开启查询日志的方式很简单，下面我们就来测试一下：
```sql
# 修改数据库配置文件
[root@localhost ~]# vim /etc/my.cnf
general_log=on
general_log_file=/var/log/mysql/select.log

-- 测试查询
mysql> show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| test01             |
+--------------------+
7 rows in set (0.00 sec)

# 监控日志
[root@dxd ~]# tail -f /var/log/mysql/select.log
2022-05-08T15:19:01.510097Z	    4 Query	show databases
```

我们可以看到，我们执行的 SQL 全部记录下来了。

### 慢查询日志

MySQL 数据库中的慢查询日志顾名思义就是一种用来记录 MySQL 数据库中执行超过某个时间阈值的 SQL 的日志。配置时间阈值的参数是 `long_query_time`，也就是说如果一条 SQL 的执行时长超过了 `long_query_time` 设置的值时，慢日志就会将该条 SQL 记录在慢日志中。

下面我们一起来测试一下 MySQL 数据库中的慢日志：
```sql
[root@db01 ~]# vim /etc/my.cnf
#开启慢查询日志
slow_query_log = on
#指定慢日志文件存放位置（默认在data）
slow_query_log_file=/var/log/mysql/slow.log
#设定慢查询的阈值(默认10s)
long_query_time=1
#不使用索引的慢查询日志是否记录到日志
log_queries_not_using_indexes=ON
#保存慢日志的方式（FILE指的是文件）
log_output='FILE'

-- 重启数据库之后，睡眠两秒钟，此时超过我们设置的 1 秒，所以会被慢日志记录
mysql> select sleep(2);
+----------+
| sleep(2) |
+----------+
|        0 |
+----------+
1 row in set (2.00 sec)

-- 查看日志记录
[root@dxd ~]# tail -f /var/log/mysql/slow.log
# Time: 2022-05-08T15:30:16.344242Z
# User@Host: root[root] @ dxd [172.17.16.2]  Id:     4
# Query_time: 2.000291  Lock_time: 0.000000 Rows_sent: 1  Rows_examined: 0
SET timestamp=1652023816;
select sleep(2);
```

我们可以看到该条 SQL 被记录下来了，也就是说开启了慢日志的数据库会将执行时间超过 `long_query_time` 的 SQL 全部记录在慢日志中。

### 二进制日志

二进制日志是数据库中非常重要的一种日志之一，在数据库数据恢复以及主从复制方面有着非常大的作用。

二进制日志的本质是**将数据库的更新操作通过二进制的方式记录在文件中**，下面我们来测试一下：
```sql
1、开启二进制日志
[root@dxd ~]# vim /etc/my.cnf
server-id = 1                                # mysql5.7必须加，否则mysql服务启动报错
binlog_format='row'                          # binlog工作模式
log-bin = /var/lib/mysql/mybinlog            # 路径及命名，默认在data下
expire_logs_days = 10                        # 过期时间,二进制文件自动删除的天数,0代表不删除
max_binlog_size = 100M                       # 单个日志文件大小

2、查看
[root@dxd ~]# tail -f /var/log/mysql/mybinlog.000001
_bin�wbw{5.7.36-log�wb8


**4T? 7�wb#���]�
```

我们可以看到，此时二进制日志已经生成。

那么上面我们说了，二进制日志主要是用来做数据恢复和主从复制的，这里我们就来一起测试一下二进制日志是否可以恢复丢失的数据。
```sql
1、首先我们新增几条数据
CREATE TABLE `test01`.`city`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NULL,
  `fid` int(11) NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci;

mysql> insert into city (name, fid) values ("海淀区", 2);
Query OK, 1 row affected (0.01 sec)

mysql> insert into city (name, fid) values ("静安区", 1);
Query OK, 1 row affected (0.00 sec)

-- 查询结果
mysql> select * from city;
+----+-----------+------+
| id | name      | fid  |
+----+-----------+------+
|  1 | 海淀区    |    2 |
|  2 | 静安区    |    1 |
+----+-----------+------+
2 rows in set (0.00 sec)


2、模拟数据丢失
[root@dxd ~]# rm -rf /var/lib/mysql/test01

3、通过二进制日志恢复数据
[root@dxd ~]# mysqlbinlog  /var/log/mysql/mybinlog.000001 | mysql -uroot -pTest123! -h172.17.16.2
mysql: [Warning] Using a password on the command line interface can be insecure.

4、检查数据库
mysql> show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test01             |
+--------------------+
10 rows in set (0.00 sec)
```

我们可以看到数据库已经恢复。

除此之外，上述二进制日志配置文件中还有一个知识点需要同大家介绍，就是二进制日志的工作模式`binlog_format='row'`，其中 `binlog_format` 有三个参数，分别是`STATEMENT`、`ROW` 和 `MIXED`。

- `STATEMENT`：会将每一条修改数据的 SQL 记录到二进制日志之中，优点是性能很好，缺点是遇到函数或存储过程的场景可能会出现问题，例如 sleep函数。

- `ROW`：不记录上下文信息（不记录 SQL ），只记录数据的变化，也就是说会记录数据变化的结果而不是 SQL 。这样做的好处是能够避免数据库在使用函数情况下导致的问题，但是缺点也很明显，就是会产生大量的日志。

- `MIXED`：它是结合了 `STATEMENT` 和 `ROW` 的优点，通常情况下只记录 SQL ，但是在使用函数或者存储过程的场景中会自动记录成数据变化的结果，这样做的好处是既可以减少日志的体积，又可以避免一下场景下的错误问题。

### 总结

今天我们介绍了错误日志、事务日志、慢日志以及二进制日志。

- 错误日志主要是用来记录数据库运行过程中的一些警告或者错误的日志，有利于我们排查数据库问题。
- 事务日志主要是利用 MVCC 快照和 Redo 记录脏数据的方式来保证事务的提交和回滚。
- 慢日志主要是通过设置 `long_query_time` 时间阈值来记录执行时间超过这个阈值的 SQL 的，这样做有利于直接排查执行时长较长的 SQL 进而进行优化。但是这个阈值不要设置得太低，以为越低记录的 SQL 就越多，消耗的磁盘 IO 就越高。
- 二进制日志主要是用来保存修改数据库的操作的，主要作用是用于数据恢复和主从复制的载体。

在日常的工作中，慢日志的阈值一般设置成 2 秒即可。