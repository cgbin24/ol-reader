在介绍本节内容之前，我先卖个关子。

我们在使用 MySQL 数据库的过程中可能会遇到如下几种情况。

`第一种情况`：在事务 A 中修改一条数据，然后在事务 B 中直接使用了这个数据；但是当事务 B 使用完这条数据之后，事务 A 又回滚了这条数据。具体情况如下。

- 现有数据：

```sql
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
 
mysql> select * from city1;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.03 sec)
```

- 事务 A：

```sql
mysql> begin;
Query OK, 0 rows affected (0.07 sec)
 
mysql> update city set fid = 2 where id = 1;
Query OK, 1 row affected (0.03 sec)
Rows matched: 1  Changed: 1  Warnings: 0
 
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   2 |
+----+-----------+-----+
1 row in set (0.03 sec)
```

- 事务 B：

```sql
mysql> set tx_isolation='READ-UNCOMMITTED';
Query OK, 0 rows affected (0.04 sec)
 
mysql> begin;
Query OK, 0 rows affected (0.03 sec)
 
mysql> update city1 set fid = (select fid from city where id = 1) + 1 where id = 1;
Query OK, 1 row affected (0.04 sec)
Rows matched: 1  Changed: 1  Warnings: 0
 
mysql> select * from city1;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   3 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

- 事务 A 回滚：

```sql
mysql> rollback;
Query OK, 0 rows affected (0.04 sec)
事务 B 提交之后再次查询数据：
mysql> commit;
Query OK, 0 rows affected (0.04 sec)
 
mysql> select * from city1;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   3 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

我们发现事务 B 使用了事务 A 未提交的数据，这种现象在 MySQL 数据库中叫作：**脏读**。

`第二种情况`：在事务 A 中，查询某条数据；在事务 B 中修改该条数据；此时事务 A 再次查询该条数据发现该条数据发生了修改。

- 原始数据：

```sql
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

- 事务 A 中查询：

```sql
mysql> set tx_isolation='READ-UNCOMMITTED';
Query OK, 0 rows affected (0.03 sec)

mysql> begin;
Query OK, 0 rows affected (0.03 sec)
 
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.03 sec)
```

- 事务 B 中修改数据：

```sql
mysql> begin;
Query OK, 0 rows affected (0.04 sec)
 
mysql> update city set fid = 2 where id = 1;
Query OK, 1 row affected (0.04 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

- 事务 A 中再次查询该条数据：

```sql
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   2 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

通过上面案例，我们发现，当我们在事务 A 中再次查询这条数据的时候结果已经发生了改变。在 MySQL 数据库中，这种现象被称为：**不可重复读**。

`第三种情况`：在事务 A 中修改数据表中所有的数据，此时在事务 B 中向该数据表中插入一条数据，事务 A 就会发现明明修改了所有的数据却仍然还有数据未被修改。

- 原始数据：

```sql
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

- 在事务 A 中修改数据表中所有的数据：

```sql
mysql> set tx_isolation='READ-UNCOMMITTED';
Query OK, 0 rows affected (0.04 sec)
 
mysql> begin;
Query OK, 0 rows affected (0.03 sec)

mysql> update city1 set fid = 10;
Query OK, 1 row affected (0.04 sec)
Rows matched: 1  Changed: 1  Warnings: 0
在事务 B 中新增一条数据：
mysql> begin;
Query OK, 0 rows affected (0.09 sec)

mysql> insert into city1 (name, fid) value('深圳市', 1);
Query OK, 1 row affected (0.04 sec)
```

- 在事务 A 中查询所有的数据：

```sql
mysql> select * from city1;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |  10 |
|  2 | 深圳市     |   1 |
+----+-----------+-----+
2 rows in set (0.04 sec)
```

通过上面案例，我们发现当事务 A 修改了所有的数据之后，又发现事务 B 中提交的一条数据没有修改。在 MySQL 数据库中，把这种现象称为：**幻读**。

### 隔离机制

介绍完上述三种情况之后，有朋友肯定会问：为什么会出现这种情况呢？

这正是本篇文章要介绍的内容。

我们在学习 MySQL 事务的时候，一定还记得事务的四种特性：**原子性、一致性、持久性以及隔离性**。

在这里，我们简单复习一下事务的这四种特性：

- 原子性是说 MySQL 事务中所有的操作要么全部成功，要么全部失败；
- 一致性是说事务执行前后 MySQL 中的数据仍然是一致的；
- 持久性是说一旦事务提交，将会永久保存到数据库的数据中无法回滚；
- 而隔离性则是为了防止数据库并发时两个不同事务之间相互影响。

今天，我在这篇文章中就来详细跟你介绍下**事务隔离机制的底层原理**。

在 MySQL 数据库中的隔离机制有四种，按照隔离的强度由弱到强分别是：`READ UNCOMITTED、READ COMMITTED、REPEATABLE READ以及SERIALIZABLE`四种。

首先我们介绍一下`READ UNCOMITTED`，翻译过来的意思是：**读未提交，也就是可以读到未提交的信息**。读未提交也是 MySQL 数据库中隔离性最低的一种隔离机制了。这种隔离机制几乎没有隔离性，在这种隔离机制上是会出现脏读、不可重复读以及幻读。上述三个案例使用的就是最好的佐证。

这种隔离机制在实际应用中使用得非常少，因为它在 MySQL 并发时，多个事务会存在相互影响这一问题。

第二种隔离机制是`READ COMMITTED`，翻译过来的意思是：**提交读，也就是说一个事务提交之后，在其他事务中可以读到该数据**。具体情况如下。

- 原数据：

```sql
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.03 sec)
```

- 事务 A 修改数据：

```sql
mysql> begin;
Query OK, 0 rows affected (0.03 sec)

-- 修改数据
mysql> update city set fid = 2 where id = 1;
Query OK, 1 row affected (0.04 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

- 事务 B 查询该数据：

```sql
mysql> set tx_isolation='READ-COMMITTED';
Query OK, 0 rows affected (0.04 sec)

mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

与 `READ UNCOMITTED` 所不同的是，当事务隔离机制设置成 `READ COMMITTED` 时，事务 A 修改数据且未提交时，事务 B 是无法查看的。

- 事务 A 提交：

```sql
mysql> commit;
Query OK, 0 rows affected (0.04 sec)
```

- 事务 B 再次查看这条数据：

```sql
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   2 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

我们可以看到在事务 B 中可以查看到事务 A 中已经提交的内容了。这种隔离机制能够**有效地解决事务并发时脏读这一现象**。

第三种隔离机制`REPEATABLE READ`，翻译过来就是**可重复读**。在这种隔离机制中每一个事务都是相互隔离的，也就是说每一个事务都是互不影响的。具体情况如下。

- 原数据：

```sql
mysql> select * from city;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

- 在事务 A 中修改数据：

```sql
mysql> begin;
Query OK, 0 rows affected (0.04 sec)
 
mysql> update city set fid = 2 where id = 1;
Query OK, 1 row affected (0.04 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

- 在事务 B 中查看：

```sql
mysql> set tx_isolation='REPEATABLE-READ';
Query OK, 0 rows affected (0.04 sec)
 
mysql> begin;
Query OK, 0 rows affected (0.04 sec)
 
mysql> select * from city ;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

我们可以看到，并没有查看到事务 A 中修改后的数据。

- 事务 A 提交：

```sql
mysql> commit ;
Query OK, 0 rows affected (0.04 sec)
```

- 在事务 B 中查看：

```sql
mysql> select * from city ;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

我们可以看到仍然没有查看到事务 A 提交后的数据。

这种事务隔离机制可以**有效地解决不可重复读这一现象**。

`REPEATABLE READ`也是 MySQL 数据库默认的事务隔离机制，但是这种事务隔离机制还无法解决幻读这一现象。如果想要彻底解决幻读现象，MySQL 数据库还为我们提供了最后一种隔离机制：`SERIALIZABLE`

`SERIALIZABLE`是 MySQL 数据库中**隔离性最强**的一种事务隔离机制。在这种隔离机制中，会把每一行数据都加上锁，具体如下。

- 原数据：

```sql
mysql> select * from city ;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

- 在事务 A 中查询所有的数据：

```sql
mysql> set tx_isolation='SERIALIZABLE';
Query OK, 0 rows affected (18.61 sec)
 
mysql> begin;
Query OK, 0 rows affected (0.04 sec)
 
mysql> select * from city1;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市 |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

- 在事务 B 中插入一条数据：

```sql
mysql> begin;
Query OK, 0 rows affected (0.04 sec)
 
mysql> insert into city (name, fid) value ('深圳市', 1);
Query OK, 1 row affected (0.04 sec)
```

- 在事务 A 中查询，仍然查询不到新增的数据：

```sql
mysql> select * from city1;
+----+-----------+-----+
| id | name      | fid |
+----+-----------+-----+
|  1 | 上海市     |   1 |
+----+-----------+-----+
1 row in set (0.04 sec)
```

由上述案例可以得出，**`SERIALIZABLE`是 MySQL 数据库中唯一能够解决幻读的隔离机制**。其主要原因是它将所有的数据全部加上了锁，随之而来的问题是，这种隔离机制效率非常低下，性能开销也非常高，我并不建议你使用。

### 实现

介绍了上述各种隔离机制之后，你一定非常想了解事务隔离机制的底层原理，下面我们就来聊聊这个话题。

在介绍隔离机制原理之前，我首先介绍两个概念。

- **当前读**。所谓当前读，就是说在 MySQL 数据库中，部分操作总是会读取最新的数据，例如：`UPDATE`、`ALTER`以及`INSERT`等语句。这些语句有一个共同的特点是其在操作数据的时候会将所操作的数据加锁，以至于其他事务无法修改（这样做的目的是保证数据安全，具体请参考第 11 篇和 12 篇的锁机制）。

- **快照读**。了解 MySQL 数据库的朋友一定听说过 `MVCC`，没有听说过也不要紧，我们可以简单地理解为 MySQL 数据库中的快照。也就是说 MySQL 数据库中的部分操作读取的不是最新的数据，例如：`SELECT`。这个时候的 `SELECT` 语句读取的数据只是该条数据的一个快照版本（为方便理解，我们可以称它为历史版本）。

在 MySQL 数据库中，隔离机制 `READ UNCOMITTED` 就是直接读取最新的数据，而没有使用`MVCC`，所以就导致其能够实时读取其他事务未提交的内容。

而 `提交读` 和 `不可重复读` 则是直接使用了 `MVCC` 机制，以至于其无法读取其他事务中修改后的数据，这样做的好处是避免了锁冲突且避免了因锁机制而导致的性能低下。

最后一个隔离机制 `SERIALIZABLE` 则是直接使用锁机制，在这个隔离机制中，每一个操作都会上对应的锁，性能低下。

### 总结

今天，我主要介绍了四种隔离机制。

- `READ UNCOMITTED`：最主要的特性是能够实时读取其他事务中修改的内容，这种隔离机制性能非常好，不过隔离性非常差，多个事务之间很容易相互影响。
- `READ COMMITTED`：最主要的特征是当一个事务提交了之后，其他的事务是可以直接看到它提交之后的数据。
- `REPEATABLE READ`：最主要的特征是一个事务中操作的所有数据另一个事务是无法查看到的。
- `SERIALIZABLE`：最主要的特征是采用锁机制来控制数据。

一般，MySQL 数据库中默认的隔离机制是 `REPEATABLE READ`，非必要场景尽量不要修改事务隔离机制。