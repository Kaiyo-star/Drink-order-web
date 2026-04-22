# Drink Ordering Website

Simple drink ordering website with:

- Customer page at `/`
- Admin dashboard at `/admin`
- Five drink flavors
- Automatic total payment calculation
- Paid and debt tracking with summary totals

## Run

```bash
npm start
```

Then open:

- `http://localhost:3000/`
- `http://localhost:3000/admin`

## Notes

- Orders are stored in `data/orders.json`.
- The server uses Node's built-in `http` module with no external dependencies.
- State writes are serialized to reduce conflicts during bursts of concurrent orders.
