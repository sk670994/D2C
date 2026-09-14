# AdSpy v24 — migration fix

The v23 SQL failed because PostgreSQL does not allow `CREATE OR REPLACE FUNCTION`
to change the return row type defined by OUT parameters.

v24 drops the exact 4-argument function signature first, then recreates it with
the new return columns.

Run the corrected migration once. It is wrapped in a transaction.
