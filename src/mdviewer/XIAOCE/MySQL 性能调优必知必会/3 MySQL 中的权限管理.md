某天，女朋友突然问你：“还有多少私房钱？”这个时候惊恐的你该怎么办呢？直接把余额给她看？显然很不符合我们的性格；如果这个时候能有一个临时的支付宝账号，让她看不到真实的余额该有多好啊！

这样的账号就涉及到了数据库的权限问题，下面我们一起来讨论一下 MySQL 中的权限管理。

### 权限的验证流程

通常，我们提及数据库中的权限的时候，我们想到的可能是 MySQL 数据库中的 user 表。但是，我想告诉你的是 MySQL 数据库中的权限验证不仅仅只有一个 user 表这么简单，我们可以通过下图深入了解一下 MySQL 数据库的认证体系。

![流程图 (1).jpg](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0669e8dee7b5462ab8768e3729efd3c5~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

通过上图，我们可以清晰地看到，MySQL 数据的权限认证过程并不是只有一个 user 表在起作用。

#### 第一层：用户登录

在用户登录 MySQL 数据库的时候，首先会将用户输入的用户名密码以及 Host 跟 mysql 数据库中的 user 表中的 Host、User 以及 Password 三个字段相匹配，这一步是**判断用户是否拥有登录权限**。如果匹配不成功，将会报一个 `ERROR 1045 (28000): Access denied for user 'xiaoyang'@'localhost' (using password: YES)` 错误。一旦 MySQL 认为用户没有登录权限，将会直接拒绝登录。
```sql
[root@dxd ~]# mysql -uxiaoyang -pxiaoyang
mysql: [Warning] Using a password on the command line interface can be insecure.
ERROR 1045 (28000): Access denied for user 'xiaoyang'@'localhost' (using password: YES)
```

#### 第二层：全局权限

当用户通过了第一层用户登录验证之后，将会直接在 user 表中**匹配全局权限**，一旦匹配成功之后就会对全局所有的数据库都拥有相应的权限。例如，只给 xiaoyang 这个用户设置一个全局可读权限，那么 xiaoyang 将拥有全局可读权限。

- 使用 root 用户创建 xiaoyang 用户：

```sql
# 创建一个用户，Create User创建的用户默认没有任何权限
mysql> CREATE USER 'xiaoyang'@'localhost' IDENTIFIED BY 'Xiangyang123!';
Query OK, 0 rows affected (0.00 sec)
```

- 使用 xiaoyang 用户测试查看权限：

```sql
mysql> select * from test01.city;
ERROR 1142 (42000): SELECT command denied to user 'xiaoyang'@'localhost' for table 'city'
```

- 使用 root 用户给 xiaoyang 用户授权：

```sql
# 将 xiaoyang 这个用户设置一个全局可读权限
mysql> update mysql.user set Select_priv='Y' where User='xiaoyang';
Query OK, 1 row affected (0.00 sec)
Rows matched: 1 Changed: 1 Warnings: 0

# 刷新权限，使其生效
mysql> flush privileges;
Query OK, 0 rows affected (0.00 sec)
```

- 测试 xiaoyang 查看权限：

```sql
# 测试查看权限

mysql> select * from test01.city;
+----+--------------+------+
| id | name         | fid  |
+----+--------------+------+
| 1  | 徐汇区        | 1    |
| 2  | 浦东新区      | 1    |
| 3  | 青浦区        | 1    |
+----+--------------+------+
3 rows in set (0.00 sec)
```

通过上面的例子可以看出，当 xiaoyang 这个用户拥有一个全局可读权限之后，就可以查看所有数据库中的所有数据了。设想一下，如果 xiaoyang 这个用户没有全局权限，怎么办？

#### 第三层：数据库级别权限

如果全局权限验证失败，将会进入数据库级权限验证，这个层级的权限是**设置某个用户针对于某个数据库的权限**。例如：xiaoyang 这个用户只允许操作 test01 这个数据库，我们来看一下它的实现过程。

- 将 xiaoyang 用户设置 test01 数据库的查询权限：

```sql
# 添加查看权限(清空了其他的所有权限之后添加)
mysql> insert into mysql.db (Host,User,Select_priv,Db) values('localhost', 'xiaoyang', 'Y', 'test01');
Query OK, 1 row affected (0.00 sec)

# 查看添加的权限

mysql> select Host,User,Select_priv,Db from mysql.db;
+-----------+---------------+-------------+--------------------+
| Host      | User          | Select_priv | Db                 |
+-----------+---------------+-------------+--------------------+
| localhost | xiangyang     | Y           | test01             |
+-----------+---------------+-------------+--------------------+

3 rows in set (0.00 sec)
```

- 使用 xiaoyang 用户查看 test01 数据中任意表的数据：

```sql
# 查看test01数据，有权限

mysql> select * from test01.city;
+----+--------------+------+
| id | name         | fid  |
+----+--------------+------+
| 1 | 徐汇区         | 1    |
| 2 | 浦东新区       | 1    |
| 3 | 青浦区         | 1    |
+----+--------------+------+
3 rows in set (0.00 sec)

# 查看其他数据库的数据，是没有权限的
mysql> select * from vue.sp_goods;
ERROR 1142 (42000): SELECT command denied to user 'xiaoyang'@'localhost' for table 'sp_goods'
```

通过这个案例，我们可以看出数据库级别的权限只对某一个数据库起作用，而设置数据库级别的权限时底层操作的正是 `mysql.db 数据表`，也就是说在 mysql.db 数据表中设置了对应的权限之后，该用户将对这个数据库中所有的数据都拥有该权限。

在实际应用场景中，如果某一个用户只允许操作某一个数据库，而其他数据库是一个没有权限的状态，这个时候就需要用到数据库级权限。

如果要求只允许某个表拥有权限怎么办呢？

#### 第四层 ：数据表级权限

数据表级权限是用来定义某个数据表的权限的，具体定义在 `mysql.tables_priv 数据表`中，当数据库级权限验证失败之后就会验证表级权限。例如：要求 xiaoyang 这个用户只允许查看 test01 数据库中的 city 表，这个权限的实现具体如下。

- 将 xiaoyang 用户设置 test01 数据库中 city 数据表的查询权限：

```sql
# 增加数据表级权限（其他权限全部清除）

mysql> INSERT INTO mysql.tables_priv (Host, Db, User, Table_name, Table_priv) VALUES ('localhost', 'test01', 'xiaoyang', 'city', 'Select');
Query OK, 1 row affected (0.00 sec)
```

- 使用 xiaoyang 用户查询 test01 数据库中 city 数据表的数据：

```sql
# 查看 test01 数据库中 city 数据表有权限

mysql> select * from test01.city;
+----+--------------+------+
| id | name         | fid  |
+----+--------------+------+
| 1 | 徐汇区         | 1    |
| 2 | 浦东新区       | 1    |
| 3 | 青浦区         | 1    |
+----+--------------+------+
3 rows in set (0.00 sec)

# 查看其他相同数据库中其他表是没有权限的

mysql> select * from test01.info;
ERROR 1142 (42000): SELECT command denied to user 'xiaoyang'@'localhost' for table 'info'
```

通过这个案例，我们可以了解到的是 mysql.tables_priv 数据表主要是用来针对某一个数据表来设置权限的。它比数据库级权限更加地`精细化`。

在实际应用场景中，如现在有一个访客浏览记录表，一般要求只允许查看和添加，不允许有其他修改操作；还有例如订单数据表，一般只允许添加、查看和修改，不允许删除等应用场景，数据表级权限有着不可替代的作用。

再试想一下，如果想要 xiaoyang 用户对订单数据表中的余额字段只能查看，又该如何呢？

#### 第五层：字段级权限

**字段级权限控制的主要是某一个字段的操作权限**，当数据库需要针对某个具体的字段做权限控制之时，就需要使用字段级权限（`注意：设置字段级权限的数据表在 mysql.columns_priv 数据表中，但是 mysql.tables_priv 需要首先添加 column_priv 权限才能生效`）。例如：要求 xiaoyang 这个用户，只允许查看 sp_order 数据表中的 order_price 字段。

- 设置 xiaoyang 这个用户对 sp_order 数据表中的 order_price 字段的可读权限：

```sql
# 在 mysql.tables_priv 数据表中添加字段查看权限

mysql> INSERT INTO mysql.tables_priv (Host, Db, User, Table_name, Column_priv) VALUES ('localhost', 'test01', 'xiaoyang', 'sp_order', 'Select');
Query OK, 1 row affected (0.00 sec)

# 在 **mysql.columns_priv** 中添加字段查看权限
mysql> INSERT INTO mysql.columns_priv (Host, Db, User, Table_name, Column_name, Column_priv) VALUES ('localhost', 'test01', 'xiaoyang', 'sp_order', 'order_price', 'Select');
Query OK, 1 row affected (0.00 sec)
```

- 测试该字段的可读权限：

```sql
# 查看 order_price 字段，可以正常查看

mysql> select order_price from vue.sp_order;
+-------------+
| order_price |
+-------------+
| 222.00      |
+-------------+
27 rows in set (0.00 sec)

# 查看其他字段，没有权限
mysql> select id from vue.sp_order;
ERROR 1143 (42000): SELECT command denied to user 'xiaoyang'@'localhost' for column 'id' in table 'sp_order'
```

通过这个案例，可以看出字段级权限主要是控制某一个字段的权限。在实际应用中，通常用来控制某个字段。例如：控制订单表中的金额字段无法修改，而其他字段不受影响，这时就可以使用字段级权限。

#### 第六层：对象级权限

上文中我们介绍了全局、数据库级、数据表级以及字段级的权限，除此之外，还有一个是用来管理数据库存储过程和存储函数权限的权限，及对象级权限（该权限相关的数据表是 mysql.procs_priv ）。

举个例子：超级管理员创建一个名为 select_city 的存储过程，只给 xiaoyang 这个用户使用该函数的权限，不给修改权限，具体操作如下。

- root 用户创建存储过程：

```sql
mysql> delimiter $$
mysql> CREATE PROCEDURE select_city(IN city_id INTEGER)
-> BEGIN
-> select * FROM city WHERE id = city_id;
-> END$$
Query OK, 0 rows affected (0.00 sec)
mysql> delimiter ;
```

- 设置 xiaoyang 用户的权限：

```sql
mysql> use mysql;

# 增加存储过程权限
mysql> INSERT INTO procs_priv (Host, Db, User, Routine_name, Routine_type, Proc_priv) VALUES ('localhost', 'test01', 'xiaoyang', 'select_city', 'PROCEDURE', 'Execute');
Query OK, 1 row affected (0.00 sec)
```

- 存储过程可以正常使用：

```sql
# 选择数据库
mysql> use test01;
Database changed

# 使用存储过程
mysql> call select_city(1);
+----+-----------+------+
| id | name | fid |
+----+-----------+------+
| 1 | 徐汇区 | 1 |
+----+-----------+------+
1 row in set (0.00 sec)
Query OK, 0 rows affected (0.00 sec)
```

- 无法删除存储过程：

```sql
# 删除存储过程显示无权限
mysql> DROP PROCEDURE select_city;
ERROR 1370 (42000): alter routine command denied to user 'xiaoyang'@'localhost' for routine 'test01.select_city'
```

通过上面这个案例可以得出：**mysql.procs_priv 数据表主要是用来控制存储过程的权限的**。在实际应用中，我们需要注意存储过程权限一旦授予之后，自动会将数据库的查看权限一并授予，但是会显示数据表为空。
```sql
mysql> use test01;
Database changed

mysql> show tables;
Empty set (0.00 sec)
```

### 总结

数据的权限主要分为六个层级：

- 第一层是`登录验证`，验证失败则立即退出；
- 第二层的权限为`全局权限`，这个层级的权限覆盖整个数据库；
- 第三层的权限是`数据库级别的权限`，这个层级的权限是针对于某一个数据库的；
- 第四层级是`数据表级的权限`，这个层级的权限主要针对于数据表；
- 第五层权限是`字段级的权限`，主要针对于某一个字段的，需要注意的是字段级的权限需要依赖于第四层数据表级查看权限，没有数据表级查看权限，字段级权限无法生效；
- 最后一个`对象级权限`，这个权限主要是针对于存储函数和存储过程的，只有拥有该权限，才能够操作数据库存储函数或存储过程。

但是，在实际应用中，我们不需要将权限设置得过于精细化，因为过于精细化容易造成权限交叉并且设置权限的管理也会是相当的麻烦。