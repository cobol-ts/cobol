       01 ODO-RECORD.
          05 ITEM-COUNT PIC 9.
          05 ITEMS OCCURS 0 TO 3 TIMES
             DEPENDING ON ITEM-COUNT.
             10 ITEM-CODE PIC X(2).
          05 TRAILER PIC X.
