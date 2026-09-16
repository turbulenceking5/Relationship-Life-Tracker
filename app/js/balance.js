// "Who owes who" for a two-person household: each member is responsible
// for their split_percent share of every logged expense; settlements
// are direct payments between partners that offset the running balance
// without being logged as an expense themselves.
export function computeBalance(expenses, settlements, members) {
  if (members.length !== 2) return null;
  const [a, b] = members;

  let total = 0;
  const paidByUser = { [a.user_id]: 0, [b.user_id]: 0 };
  for (const e of expenses) {
    const amt = Number(e.amount);
    total += amt;
    paidByUser[e.paid_by] = (paidByUser[e.paid_by] || 0) + amt;
  }

  const balance = {
    [a.user_id]: paidByUser[a.user_id] - total * (a.split_percent / 100),
    [b.user_id]: paidByUser[b.user_id] - total * (b.split_percent / 100),
  };

  for (const s of settlements) {
    const amt = Number(s.amount);
    balance[s.from_user] = (balance[s.from_user] || 0) + amt;
    balance[s.to_user] = (balance[s.to_user] || 0) - amt;
  }

  const diff = balance[a.user_id];
  const amount = Math.round(Math.abs(diff) * 100) / 100;
  // A percentage split (e.g. 35/65) of a dollar amount often doesn't land
  // on a whole cent, so paying the displayed (rounded) balance can leave a
  // sub-cent residual that would otherwise never register as "settled."
  if (amount <= 0.01) return { settled: true, amount: 0 };
  return diff > 0
    ? { settled: false, owedBy: b.user_id, owedTo: a.user_id, amount }
    : { settled: false, owedBy: a.user_id, owedTo: b.user_id, amount };
}
