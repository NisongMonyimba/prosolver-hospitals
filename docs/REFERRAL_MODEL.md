# Referral and points model

Each member gets a random 18-character hexadecimal referral code generated on first insert. It cannot be reassigned. A new referred member must submit a problem and verify email; the referrer must be verified at that time. Self-referrals, invalid codes and duplicate referred members earn no credit.

One initial verified problem is free. One qualifying verified referral earns one immutable +1 ledger event. One additional verified problem uses one -1 event. Pending extra submissions reserve the ability to submit but points are consumed only at verification. Database constraints and a nonnegative trigger reject replay and overspend. Points are nontransferable, have no cash value and do not promise resolution.

The founder may call the reversal endpoint with a reason. It creates a separate -1 ledger event and audit event. If a point has already been redeemed and no balance remains, reversal returns 409; the founder must review the case and any resulting work manually. Multiple email addresses do not establish multiple genuine professionals; suspicious referrals need human review.
