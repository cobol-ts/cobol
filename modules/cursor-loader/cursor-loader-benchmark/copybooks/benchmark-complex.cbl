       01 BENCHMARK-RECORD.
          05 RECORD-ID        PIC 9(10).
          05 ACCOUNT-CODE     PIC X(8).
          05 AMOUNT-AREA.
             10 AMOUNT-CELL OCCURS 2 TIMES.
                15 CELL-VALUE PIC 9(9).
          05 AMOUNTS-ALIAS REDEFINES AMOUNT-AREA.
             10 AMOUNT-A      PIC 9(9).
             10 AMOUNT-B      PIC 9(9).
          05 STATUS-CODE      PIC X.
          05 REGION-CODE      PIC X.
          05 CATEGORY-CODE    PIC X.
          05 APPROVED-FLAG    PIC X.
          05 BALANCE          PIC 9(10).
          05 CUSTOMER-NAME    PIC X(30).
          05 DESCRIPTION      PIC X(50).
          05 REFERENCE-CODE   PIC X(30).
          05 FILLER           PIC X(40).
