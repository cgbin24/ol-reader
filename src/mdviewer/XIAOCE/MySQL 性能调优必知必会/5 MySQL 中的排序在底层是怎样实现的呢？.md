在日常的 MySQL 数据库使用过程中，我们通常会遇见排序的需求，例如：按照消费金额排序，按照字母排序，等等。

下面我们以一个简单的订单表为例：
```sql
CREATE TABLE `sp_order` (
`id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键id',
`order_id` int(10) unsigned NOT NULL COMMENT '订单ID',
`user_id` mediumint(8) unsigned NOT NULL COMMENT '下订单会员id',
`order_number` varchar(32) NOT NULL COMMENT '订单编号',
`order_price` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '订单总金额',
`order_pay` enum('0','1','2','3') NOT NULL DEFAULT '1' COMMENT '支付方式 0未支付 1支付宝 2微信 3银行卡',
`pay_status` enum('0','1') NOT NULL DEFAULT '0' COMMENT '订单状态： 0未付款、1已付款',
`create_time` int(10) unsigned NOT NULL COMMENT '记录生成时间',
`update_time` int(10) unsigned NOT NULL COMMENT '记录修改时间',
PRIMARY KEY (`id`),
KEY `index_1` (`order_number`)
) ENGINE=InnoDB AUTO_INCREMENT=10000 DEFAULT CHARSET=utf8 COMMENT='订单表';
```

我们用 Python 生成一万条测试数据，用来测试数据库排序。
```python
# -*- coding: utf-8 -*-
import pymysql
import random

n = 1
db = pymysql.connect("127.0.0.1", "root", "", "test01")

while n < 10000:
    n = n + 1

    # 使用cursor()方法创建一个游标对象
    cursor = db.cursor()

    # 使用execute()方法执行SQL语句
    sql = "INSERT INTO sp_order(order_id, user_id, order_number, order_price, order_pay, pay_status, create_time, update_time) VALUES(%s,%s,%s,%s,'%s','%s',%s,%s)"

    order_id = random.randint(0, 100000000)
    user_id = random.randint(0, 1000)
    order_number = "DD" + str(order_id)
    order_price = round(random.uniform(0, 1000), 2)
    order_pay = random.randint(0, 3)
    pay_status = random.randint(0, 1)
    create_time = str(150) + str(random.randint(1000000, 9999999))
    update_time = str(150) + str(random.randint(1000000, 9999999))

    cursor.execute(sql, (order_id, user_id, order_number, order_price, order_pay, pay_status, create_time, update_time))

    # 提交数据
    db.commit()

    # 关闭游标和数据库的连接
    cursor.close()

# 关闭数据库连接
db.close()
```

假设我们现在需要查询金额大于 100 且按照订单编号进行排序的前 1000 行数据的订单金额、支付方式以订单编号及付款状态，我们就可以得到如下 SQL：
```sql
select order_price, order_pay, order_number, pay_status from sp_order where order_price > 100 order by order_number limit 1000;
```

这个时候我们可以想一下，MySQL 数据库的底层是怎样进行排序的呢？下面我们就来聊一聊。

### 排序原理

MySQL 数据库在进行排序之前，都会在内存中开辟一段新的内存空间用来进行排序，称：`sort_buffer`。

首先 MySQL 数据库会将需要查询的字段（对于上述SQL来说，需要查询的字段是：order_price, order_pay, order_number, pay_status这几个字段）存放于 sort_buffer 内存块中。如果 sort_buffer 的空间（sort_buffer 的空间大小受参数 sort_buffer_size 控制）足够大，MySQL 数据库将会在内存中实现排序，否则将会使用临时文件的方式来承载排序的内容或使用rowid方式进行排序。

具体如下：

在 MySQL 数据库中，判断一条 SQL 是否需要排序，我们可以使用 explain 语句来测试，其中 Extra 字段中包含 Using filesort 就代表这条 SQL 需要排序，具体如下：
```sql
mysql> explain select order_price, order_pay, order_number, pay_status from sp_order where order_price > 100 order by order_number limit 1000;
+----+-------------+----------+------------+------+---------------+------+---------+------+-------+----------+-----------------------------+
| id | select_type | table    | partitions | type | possible_keys | key  | key_len | ref  | rows  | filtered | Extra                       |
+----+-------------+----------+------------+------+---------------+------+---------+------+-------+----------+-----------------------------+
|  1 | SIMPLE      | sp_order | NULL       | ALL  | NULL          | NULL | NULL    | NULL | 10297 |    33.33 | Using where; Using filesort |
+----+-------------+----------+------------+------+---------------+------+---------+------+-------+----------+-----------------------------+
1 row in set, 1 warning (0.01 sec)
```

我们可以看到，上述的 explain 语句中的 Extra 字段中是包含 Using filesort 的，所以 `select order_price, order_pay, order_number, pay_status from sp_order where order_price > 100 order by order_number limit 1000;` 这条 SQL 在查询的时候是需要再排序的。下面我们就以这条 SQL 为例，来讨论一下 MySQL 数据库是怎样进行排序的。

#### 全字段排序

在介绍快速排序之前，我们先通过一张图了解一下排序的流程。

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/c39ca8ef0d634b3ea022500b330b6685~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

了解完 MySQL 数据库的排序流程之后，我们再来介绍一下上述 SQL 的排序步骤，具体如下：

- 第一步：创建 `sort buffer` 内存空间。
- 第二步：首先会根据 `WHERE` 条件，查询出符合条件的数据（这里指的是 `order_price > 100` 的所有数据）。
- 第三步：在符合条件的数据中，通过主键索引取出需要查询的数据并写入 `sort buffer` 并排序。
- 第四步：通过第三条中取得的数据的主键，再去获取下一条数据的主键，进而获取下一条数据。
- 第五步：重复第三和四步，直至取完所有的数据（此时 `sort buffer` 中只有主键和排序字段并且按照排序字段排好了顺序，如果 `sort buffer` 空间不足以承载所有的数据时，就需要借助于临时文件进行排序。）。
- 第六步：通过排好顺序的数据的主键 id，去取所需要的所有数据。
- 第七步：最后将所有排好序的数据返回。

在这个步骤中分为两种情况：

- 排序的数据大小超过 `sort buffer` 的空间大小。
- 排序的数据大小未超过 `sort buffer` 的空间大小。

我们这个下文着重分析。

因为上述 SQL 是按照 `order_number` 字段去排序之后，所得的主键 ID 就变得没有顺序了，这个时候如果通过主键去取数据就会产生很多随机 IO（我们在索引章节讲了，索引实际上就是一个由主键 ID 组成的二叉树，如果主键 ID 是没有顺序的，那么所有的查询都需要从根节点一个一个去匹配，因此产生了很多随机 IO）。

为了减少排序所产生的随机IO，将需要查询的所有字段全部存放于 `sort buffer` 中，这样当排序完成之后，数据库不用再次去拿数据，而是直接返回即可，这样就减少了数据库再次取数据的 IO 了。

但是，随之而来的是，当 `sort buffer` 的空间无法承载所有的数据的时候，又会造成新的 IO；具体如下：
```sql
-- 设置只在当前客户端有效
mysql> SET optimizer_trace='enabled=on';

-- 设置sort_buffer_size一个比较小的值，方便测试
mysql> set sort_buffer_size=2;

-- 执行查询SQL
mysql> select order_price, order_pay, order_number, pay_status from sp_order where order_price > 100 order by order_number limit 1000;

-- 查看查询信息
mysql> SELECT * FROM `information_schema`.`OPTIMIZER_TRACE`;
```

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/afb44e62f8c34304bdeae1e7137642f7~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

我们可以看到的是，在本次查询中使用了 27 个临时文件（number_of_tmp_files指的是本次查询使用的临时文件的个数），出现这种情况的主要原因是当 `sort buffer` 空间不足以承载需要排序的内容时，MySQL 数据库会采用临时文件来进行辅助排序，但是此次排序会增加新的 `磁盘IO`，也就是操作临时文件的`IO`。

这个时候 MySQL 数据库提供了一个 `max_length_for_sort_data` 的参数，这个参数主要是用来设置需要排序的每一行的数据最大长度。

如果需要排序的字段长度没有超过 `max_length_for_sort_data` 设置的值，那么 MySQL 就会判断需要排序的数据大小；如果没有超过 `sort buffer` 的空间，则直接在内存中进行排序，如果超过 `sort buffer` 的空间，则会借助于临时文件（临时表创建的文件）辅助排序。

如果需要排序的字段长度超过了 `max_length_for_sort_data` 设置的值，那么 MySQL 就会采用一中新的算法来进行排序，即：rowid。

#### ROWID排序

上面我们介绍到，当需要排序的字段长度超过了 `max_length_for_sort_data` 设置的值，MySQL 数据库就会采用 rowid 的方式进行排序，在这里我们就来测试一下是否是这样？
```sql
-- 首先设置 max_length_for_sort_data
mysql> SET max_length_for_sort_data = 1;
Query OK, 0 rows affected (0.03 sec)

-- 执行查询SQL
mysql> select order_price, order_pay, order_number, pay_status from sp_order where order_price > 100 order by order_number limit 1000;

-- 查看查询信息
mysql> SELECT * FROM `information_schema`.`OPTIMIZER_TRACE`;
```

![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f76a73850fa64054b803430732e892a1~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

我们可以清楚的看到，当我们设置的 `max_length_for_sort_data` 的值小于需要排序的字段大小时，在排序结果的相关信息中 `number_of_tmp_files` 的值为0，也就是说未使用任何临时文件。

但是，此时整个查询流程就有所变化了，具体如下：

- 第一步：创建 `sort buffer` 内存空间。
- 第二步：首先会根据 `WHERE` 条件，查询出符合条件的数据的主键（这里指的是 `order_price > 100` 的数据行的主键）。
- 第三步：在符合条件的数据中，通过主键索引取出id和order_number两个字段的数据写入 `sort buffer`。
- 第四步：通过第三条中取得的数据的主键，再去获取下一条数据的主键，进而获取下一条数据。
- 第五步：重复第三和四步，直至取完所有的数据。
- 第六步：在 `sort buffer` 中根据 `order_number` 进行排序。
- 第七步：按照排序好的数据主键ID再去数据表中取相关数据。
- 第八步：在排序好的数据中遍历1000行返回。

我们对比两种排序方式可以看出，rowid的方式在返回数据之前会再去数据表中取一次数据，这无疑是又多了一次`磁盘IO`，所以我不建议使用这种方式进行排序。

以上，是关于排序的原理的几种情况，但是也有几种特殊的排序会导致数据库变慢，具体如下。

### 有些情况下无法使用索引排序

MySQL 数据库中，某个字段一旦加上了索引，就意味着底层的数据就是具备某种顺序的；这是因为 MySQL 数据库中的索引通常采用的是 B+ 树算法，而 B+ 树算法底层已经是有序的了，所以不需要再额外地进行排序。具体如下：
```sql
-- 开启optimizer_trace
mysql> SET optimizer_trace='enabled=on';

-- 执行语句
mysql> select * from sp_order order by order_number limit 10;

-- 查看optimizer_trace结果
mysql> SELECT * FROM `information_schema`.`OPTIMIZER_TRACE`\G
```

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4edb15f1e85f43b2a5746a741094b500~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上图中我们可以看出，本次查询直接根据索引查询数据。不过，MySQL 数据库中索引在特殊情况下并不一定能够正常使用，具体如下。

- 第一种：在多个索引中进行排序时，无法使用索引排序。

```sql
-- 开启optimizer_trace
mysql> SET optimizer_trace='enabled=on';

-- 添加索引
mysql> ALTER TABLE `test01`.`sp_order`
    -> ADD INDEX `index_1`(`order_number`),
    -> ADD INDEX `index_2`(`order_price`);

-- 查询表结构，order_number 和 order_price 是两个相互独立的索引
mysql> show create table test01.sp_order\G
*************************** 1. row ***************************
       Table: sp_order
Create Table: CREATE TABLE `sp_order` (
。。。
  KEY `index_1` (`order_number`),
  KEY `index_2` (`order_price`)
) ENGINE=InnoDB AUTO_INCREMENT=10202 DEFAULT CHARSET=utf8 COMMENT='订单表'
1 row in set (0.00 sec)

-- 执行语句
mysql> select * from sp_order order by order_number,order_price limit 10;

-- 查看optimizer_trace结果
mysql> SELECT * FROM `information_schema`.`OPTIMIZER_TRACE`\G
```

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/2f5e42aa3cdc4c0c93350d49258f2fd6~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

根据上图，我们可以看到参与排序的字段也有两个，而并未显示命中任何索引。

- 第二种：同时包含升序与降序时，无法使用索引排序。

```sql
-- 开启optimizer_trace
mysql> SET optimizer_trace='enabled=on';

-- 添加索引
mysql> ALTER TABLE `test01`.`sp_order`
    -> ADD INDEX `index_4`(`order_price`);
Query OK, 0 rows affected (0.09 sec)
Records: 0  Duplicates: 0  Warnings: 0

-- 查询表结构，order_number 和 order_price 属于一个共同的索引
mysql> show create table test01.sp_order\G
*************************** 1. row ***************************
       Table: sp_order
Create Table: CREATE TABLE `sp_order` (
    。。。
  KEY `index_3` (`order_number`,`order_price`)
) ENGINE=InnoDB AUTO_INCREMENT=10202 DEFAULT CHARSET=utf8 COMMENT='订单表'
1 row in set (0.00 sec)

-- 执行语句
mysql> select * from sp_order order by order_price ASC,order_number DESC limit 10;

-- 查看optimizer_trace结果
mysql> SELECT * FROM `information_schema`.`OPTIMIZER_TRACE`\G
```

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e181a3a68d43439ab9278987e322cfa9~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

根据上图，我们可以看到参与排序的字段也是两个且也未命中任何索引。

综上，我们可以得出，要想正常地使用索引排序，进而降低排序造成的延时时，我们要尽量避免在多个索引中进行排序；如果非用不可时，要尽量避免同时包含升序与降序这两种情况。

### 总结

今天我们介绍了 MySQL 数据库排序的底层逻辑。

其中主要介绍了两种排序算法：

- 第一种算法是当需要排序的字段长度小于等于 `max_length_for_sort_data` 设置的值时，这时 MySQL 排序可以分为两种情况，分别是：
  - 当排序的数据大小大于 `sort buffer` 时，MySQL 会借助临时文件辅助排序。
  - 当排序的数据大小小于等于 `sort buffer` 时，MySQL 将直接在内存中进行排序（这种是最快的一种排序方式）。
- 第二种算法是当需要排序的字段长度大于 `max_length_for_sort_data` 设置的值时，这个时候排序会多出来一次`磁盘IO`的。
另外，还介绍了几种无法使用索引特殊情况，分别是在多个索引中进行排序、排序的顺序与索引的顺序不一致和同时包含升序与降序三种情况。

在实际的运用中，我建议你合理配置 `max_length_for_sort_data` 的值，MySQL 5.7默认设置的是1024，这适用于大部分场景，但特殊场景需要特殊对待。