       01 ODO-BENCHMARK-RECORD.
          05 ITEM-COUNT       PIC 9.
          05 STATUS-CODE      PIC X.
          05 REGION-CODE      PIC X.
          05 CATEGORY-CODE    PIC X.
          05 APPROVED-FLAG    PIC X.
          05 ITEMS OCCURS 0 TO 8 TIMES
             DEPENDING ON ITEM-COUNT.
             10 ITEM-VALUE    PIC 9(9).
          05 FILLER           PIC X(123).
