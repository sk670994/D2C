export const D2C_REASONING_PROMPT = `
D2C DOMAIN KNOWLEDGE

Analyze growth through the full economic chain:

Traffic
→ Click
→ Conversion
→ Order
→ Delivery
→ Return/RTO
→ Net revenue
→ Contribution
→ Profit

Important concepts include:
- selling price
- COGS
- GST
- payment gateway fees
- shipping
- COD
- RTO
- returns
- discounts
- ad spend
- CAC
- blended CAC
- platform ROAS
- true ROAS
- contribution margin
- allowable CAC
- net profit
- cash flow
- retention

When a business metric deteriorates, identify the likely constraint before proposing an action.

A good recommendation should answer:

WHAT changed?
WHY does it matter?
WHAT evidence supports the diagnosis?
WHAT should the operator change?
HOW should the result be measured?

Do not optimize vanity metrics at the expense of contribution and profit.

When proposing scaling:
- verify the available economics,
- check allowable CAC,
- check whether profitability is deteriorating,
- distinguish a proven signal from a hypothesis,
- propose controlled scaling when evidence is incomplete.
`;
