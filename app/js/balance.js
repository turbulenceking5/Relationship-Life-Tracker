// "Who owes who" for a two-person household: each member is responsible
// for their split_percent share of every logged expense, unless that
// expense set its own override (split_percent + split_percent_user_id on
// the expenses row — see 04-feature-expenses.md) — settlements are direct
// payments between partners that offset the running balance without
// being logged as an expense themselves.
function shareFor(expense, member) {
  if (expense.split_percent == null) return member.split_percent;
  return expense.split_percent_user_id === member.user_id
    ? Number(expense.split_percent)
    : 100 - Number(expense.split_percent);
}

export function computeBalance(expenses, settlements, members) {
  if (members.length !== 2) return null;
  const [a, b] = members;

  const paidByUser = { [a.user_id]: 0, [b.user_id]: 0 };
  const owedByUser = { [a.user_id]: 0, [b.user_id]: 0 };
  for (const e of expenses) {
    const amt = Number(e.amount);
    paidByUser[e.paid_by] = (paidByUser[e.paid_by] || 0) + amt;
    owedByUser[a.user_id] += amt * (shareFor(e, a) / 100);
    owedByUser[b.user_id] += amt * (shareFor(e, b) / 100);
  }

  const balance = {
    [a.user_id]: paidByUser[a.user_id] - owedByUser[a.user_id],
    [b.user_id]: paidByUser[b.user_id] - owedByUser[b.user_id],
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
