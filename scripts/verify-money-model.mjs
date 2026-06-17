// Adversarial verification of the Onion Arcade money model.
// Pure integer math. Proves the aggregate formula is broken under
// overflow-then-payout, and that the event-fold model is correct.
//
// Run: node scripts/verify-money-model.mjs

const GAME_COST = 5;
const RAKE = 0.12;
const POOL_CAP = 500;
const PAYOUT_CURVE = [0.5, 0.3, 0.2];

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  } else {
    console.log(`  ok:   ${msg}`);
  }
}
function section(t) {
  console.log(`\n=== ${t} ===`);
}

// ---------------------------------------------------------------------------
// (A) The SPEC's aggregate formula (the one under suspicion).
// total_spent grows by 5 each round. onions_added / onions_paid_out are the
// admin-add and payout running totals.
// ---------------------------------------------------------------------------
function aggregate(total_spent, onions_added, onions_paid_out) {
  const rake = Math.floor(total_spent * RAKE);
  const pool_raw = total_spent - rake + onions_added - onions_paid_out;
  const pool = Math.min(POOL_CAP, pool_raw);
  const overflow = Math.max(0, pool_raw - POOL_CAP);
  const dev_earned = rake + overflow;
  return { rake, pool_raw, pool, overflow, dev_earned };
}

// ---------------------------------------------------------------------------
// (B) The proposed EVENT-FOLD model. Fold the append-only event log in
// timestamp order, maintaining { pool, dev_earned, spent_so_far }.
// Events: {t:'round'} | {t:'add', amount} | {t:'payout', amount} | {t:'devsend', amount}
// ---------------------------------------------------------------------------
function fold(events) {
  let pool = 0;
  let dev_earned = 0;
  let dev_withdrawn = 0;
  let spent = 0; // total_spent BEFORE the current round
  for (const e of events) {
    if (e.t === "round") {
      // Incremental rake delta: the rake is floor(total_spent*RAKE) on the
      // aggregate. This round's marginal rake is the change in that floor.
      const rakeDelta =
        Math.floor((spent + GAME_COST) * RAKE) - Math.floor(spent * RAKE);
      spent += GAME_COST;
      const inflow = GAME_COST - rakeDelta; // onions toward pool this round
      dev_earned += rakeDelta; // rake portion is always dev's
      const space = POOL_CAP - pool;
      const toPool = Math.min(inflow, space);
      const over = inflow - toPool;
      pool += toPool;
      dev_earned += over; // overflow above the cap is dev's
    } else if (e.t === "add") {
      // a real-deposit seed: fills the pool up to the cap; any over-cap excess
      // is conserved to dev (the onions are real escrow onions, never dropped).
      const toPool = Math.min(e.amount, POOL_CAP - pool);
      pool += toPool;
      dev_earned += e.amount - toPool;
      e._applied = e.amount;
    } else if (e.t === "payout") {
      // payout reduces pool only, never exceeds pool
      const paid = Math.min(e.amount, pool);
      pool -= paid;
      e._applied = paid;
    } else if (e.t === "devsend") {
      const dev_balance = dev_earned - dev_withdrawn;
      const sent = Math.min(e.amount, dev_balance);
      dev_withdrawn += sent;
      e._applied = sent;
    }
  }
  return { pool, dev_earned, dev_withdrawn, dev_balance: dev_earned - dev_withdrawn, spent };
}

// ---------------------------------------------------------------------------
// CRITICAL TRACE: overflow-then-payout. Prove the aggregate erases dev's
// overflow, and the fold preserves it.
// ---------------------------------------------------------------------------
section("CRITICAL: overflow-then-payout (the reported bug)");

// NOTE: pool_raw=600 EXACTLY is unreachable by gameplay alone — spent jumps by 5
// and rake by 0/1, so pool_raw skips from 498 (spent=565) to 502 (spent=570).
// The prompt's "600" is illustrative; the bug is independent of the exact value.
// To honor the literal scenario (pool_raw=600, overflow=100) we hit it via an
// admin add: spend to a pool, then admin-add the rest so pool_raw=600. But the
// SPEC aggregate has admin add capped at the add site, so to drive pool_raw past
// the cap we use the PURE gameplay overflow path and parametrize the magnitude.

// Pick the smallest multiple-of-5 spend whose pool_raw exceeds the cap.
let spentTarget = null;
for (let s = 0; s <= 5000; s += GAME_COST) {
  if (s - Math.floor(s * RAKE) > POOL_CAP) { spentTarget = s; break; }
}
const aT = aggregate(spentTarget, 0, 0);
const OVERFLOW = aT.overflow; // the real reachable overflow at spentTarget
console.log(`  smallest overflow case: total_spent=${spentTarget}, pool_raw=${aT.pool_raw}, overflow=${OVERFLOW}`);
assert(spentTarget !== null && OVERFLOW > 0, "found a reachable gameplay overflow case");

// (a) spend until pool_raw > cap
const a = aggregate(spentTarget, 0, 0);
console.log(`  (a) aggregate: pool=${a.pool} overflow=${a.overflow} dev_earned=${a.dev_earned} (rake=${a.rake})`);
assert(a.pool === 500, "(a) pool caps at 500");
assert(a.overflow === OVERFLOW, `(a) overflow = ${OVERFLOW} (dev keeps this)`);
const devBeforePayout = a.dev_earned;

// (b) pay out the FULL pool (500): onions_paid_out += 500
const b = aggregate(spentTarget, 0, 500);
console.log(`  (b) after paying 500: pool=${b.pool} overflow=${b.overflow} dev_earned=${b.dev_earned}`);
assert(b.dev_earned === devBeforePayout - OVERFLOW,
  `AGGREGATE BUG CONFIRMED: dev_earned dropped from ${devBeforePayout} to ${b.dev_earned} (lost ${OVERFLOW} overflow)`);
assert(b.dev_earned < devBeforePayout,
  "AGGREGATE BUG: dev_earned DECREASED after a payout (must never happen for a standing pot)");

// Now the fold model on the same sequence.
const events = [];
for (let i = 0; i < spentTarget / GAME_COST; i++) events.push({ t: "round" });
const foldBefore = fold(events);
console.log(`  fold (a): pool=${foldBefore.pool} dev_earned=${foldBefore.dev_earned}`);
assert(foldBefore.pool === 500, "fold (a) pool = 500");
assert(foldBefore.dev_earned === devBeforePayout,
  `fold (a) dev_earned (${foldBefore.dev_earned}) matches aggregate (${devBeforePayout})`);

events.push({ t: "payout", amount: 500 });
const foldAfter = fold(events);
console.log(`  fold (b) after paying 500: pool=${foldAfter.pool} dev_earned=${foldAfter.dev_earned}`);
assert(foldAfter.pool === 0, "fold (b) pool drained to 0");
assert(foldAfter.dev_earned === devBeforePayout,
  `FOLD CORRECT: dev_earned UNCHANGED at ${foldAfter.dev_earned} after payout (standing pot preserved)`);

// ---------------------------------------------------------------------------
// EQUIVALENCE: in the no-payout / no-overflow case, fold == aggregate.
// ---------------------------------------------------------------------------
section("EQUIVALENCE: fold == aggregate (no payout, no admin add)");
for (const rounds of [0, 1, 1, 7, 13, 50, 99, 100, 101, 200, 500]) {
  const spent = rounds * GAME_COST;
  const agg = aggregate(spent, 0, 0);
  const evs = [];
  for (let i = 0; i < rounds; i++) evs.push({ t: "round" });
  const f = fold(evs);
  const okPool = f.pool === agg.pool;
  const okDev = f.dev_earned === agg.dev_earned;
  assert(okPool && okDev,
    `rounds=${rounds} spent=${spent}: fold{pool=${f.pool},dev=${f.dev_earned}} == agg{pool=${agg.pool},dev=${agg.dev_earned}}`);
}

// ---------------------------------------------------------------------------
// REAL SEED CONSERVATION: a seed's full settled amount is conserved (pool fills
// to the cap; any over-cap excess goes to dev — real escrow onions, no drop).
// ---------------------------------------------------------------------------
section("SEED ADD conserves: pool + dev rise by the FULL settled amount");
{
  const rounds = 20;
  const evs = [];
  for (let i = 0; i < rounds; i++) evs.push({ t: "round" });
  const before = fold(evs.slice()); // pool 88, dev 12 (rake)
  const addEv = { t: "add", amount: 1000 }; // over cap (only 412 fits)
  evs.push(addEv);
  const f = fold(evs);
  assert(addEv._applied === 1000, "full settled seed amount recorded (real onions)");
  assert(f.pool === POOL_CAP, "pool fills exactly to the cap");
  assert(
    f.pool - before.pool + (f.dev_earned - before.dev_earned) === 1000,
    "pool+dev rose by the FULL 1000 seed (over-cap excess to dev, nothing dropped)"
  );
}

// ---------------------------------------------------------------------------
// PER-ROUND RAKE ROUNDING: floor(5*0.12)=0. Rake ticks on the aggregate only.
// Show the incremental delta sequence over the first ~20 rounds.
// ---------------------------------------------------------------------------
section("PER-ROUND RAKE ROUNDING (incremental delta)");
{
  console.log(`  floor(GAME_COST*RAKE) = floor(${GAME_COST * RAKE}) = ${Math.floor(GAME_COST * RAKE)} (a single round alone gives 0 rake)`);
  let spent = 0;
  let cumRake = 0;
  const deltas = [];
  for (let r = 1; r <= 20; r++) {
    const delta = Math.floor((spent + GAME_COST) * RAKE) - Math.floor(spent * RAKE);
    spent += GAME_COST;
    cumRake += delta;
    deltas.push(delta);
  }
  console.log(`  per-round rake deltas (rounds 1..20): [${deltas.join(",")}]`);
  console.log(`  cumulative rake after 20 rounds (spent=100): ${cumRake}`);
  assert(cumRake === Math.floor(100 * RAKE), `incremental deltas sum to aggregate rake floor(100*0.12)=${Math.floor(100 * RAKE)}`);
  // Property: sum of deltas always equals the aggregate floor, for every prefix.
  let s = 0, c = 0, allMatch = true;
  for (let r = 1; r <= 1000; r++) {
    c += Math.floor((s + GAME_COST) * RAKE) - Math.floor(s * RAKE);
    s += GAME_COST;
    if (c !== Math.floor(s * RAKE)) allMatch = false;
  }
  assert(allMatch, "for EVERY prefix of rounds, sum(rake deltas) == floor(total_spent*RAKE) (no drift)");
  // Inflow per round is 5 - delta; verify it's always 4 or 5 (never negative, never >5).
  s = 0; let badInflow = false;
  for (let r = 1; r <= 1000; r++) {
    const delta = Math.floor((s + GAME_COST) * RAKE) - Math.floor(s * RAKE);
    s += GAME_COST;
    if (5 - delta < 0 || 5 - delta > 5) badInflow = true;
  }
  assert(!badInflow, "per-round pool inflow (5 - rakeDelta) stays within [0,5]");
}

// ---------------------------------------------------------------------------
// TOP-3 SPLIT 50/30/20 with floor + leftover to #1. Must sum EXACTLY to pool.
// ---------------------------------------------------------------------------
section("TOP-3 SPLIT (floor + leftover to #1, exact sum)");
function splitTop3(pool, nPlayers) {
  // Compute shares for ranks that exist. Leftover onions go to #1.
  // Returns array of {rank, amount} and the remainder left in pool.
  const ranks = Math.min(nPlayers, 3);
  if (ranks === 0) return { shares: [], paid: 0, remainder: pool };
  const shares = [];
  let distributed = 0;
  for (let i = 0; i < ranks; i++) {
    const amt = Math.floor(pool * PAYOUT_CURVE[i]);
    shares.push({ rank: i + 1, amount: amt });
    distributed += amt;
  }
  if (ranks === 3) {
    // Full payout: everything in the pool goes out; leftover to #1.
    const leftover = pool - distributed;
    shares[0].amount += leftover;
    distributed = pool;
    return { shares, paid: distributed, remainder: 0 };
  }
  // Fewer than 3 players: pay only the existing ranks their curve share,
  // the rest STAYS in the pool. (We do NOT inflate to drain the pool.)
  return { shares, paid: distributed, remainder: pool - distributed };
}

// Example from the prompt: pool=341 -> verify 170/102/68 and sum.
{
  const r = splitTop3(341, 3);
  const f1 = Math.floor(341 * 0.5), f2 = Math.floor(341 * 0.3), f3 = Math.floor(341 * 0.2);
  console.log(`  pool=341 raw floors: #1=${f1} #2=${f2} #3=${f3} (sum ${f1 + f2 + f3}, leftover ${341 - f1 - f2 - f3})`);
  console.log(`  pool=341 final shares: ${r.shares.map(s => `#${s.rank}=${s.amount}`).join(" ")} paid=${r.paid} remainder=${r.remainder}`);
  // floor(170.5)=170, floor(102.3)=102, floor(68.2)=68 -> sum 340, leftover 1 -> #1=171
  assert(f1 === 170 && f2 === 102 && f3 === 68, "raw floors are 170/102/68");
  assert(r.shares[0].amount === 171, "leftover 1 onion goes to #1 -> #1 gets 171 (prompt's 170 is the pre-leftover floor)");
  assert(r.paid === 341, "three shares sum EXACTLY to pool 341");
  assert(r.remainder === 0, "nothing left in pool after a 3-player payout");
}

// Exhaustive: for ALL pools 0..2000 with 3 players, shares sum to pool exactly,
// never exceed pool, and each share is non-negative.
{
  let bad = 0;
  for (let pool = 0; pool <= 2000; pool++) {
    const r = splitTop3(pool, 3);
    const sum = r.shares.reduce((a, s) => a + s.amount, 0);
    if (sum !== pool) bad++;
    if (r.shares.some(s => s.amount < 0)) bad++;
    if (sum > pool) bad++;
  }
  assert(bad === 0, "for ALL pools 0..2000 (3 players): shares sum to pool, none negative, never exceed pool");
}

// ---------------------------------------------------------------------------
// FEWER THAN 3 PLAYERS: pay existing ranks, remainder stays. Define exactly.
// ---------------------------------------------------------------------------
section("FEWER THAN 3 PLAYERS (remainder stays in pool)");
{
  // 1 player, pool=341: pays floor(341*0.5)=170; remainder 171 stays.
  const r1 = splitTop3(341, 1);
  console.log(`  1 player pool=341: pay #1=${r1.shares[0].amount}, remainder=${r1.remainder} stays in pool`);
  assert(r1.shares.length === 1 && r1.shares[0].amount === 170, "1 player gets floor(50%)=170");
  assert(r1.remainder === 341 - 170, "remainder 171 stays in pool (NOT drained, NOT given as leftover)");
  // 2 players, pool=341: #1=170, #2=102; remainder 69 stays.
  const r2 = splitTop3(341, 2);
  console.log(`  2 players pool=341: #1=${r2.shares[0].amount} #2=${r2.shares[1].amount}, remainder=${r2.remainder} stays`);
  assert(r2.shares[0].amount === 170 && r2.shares[1].amount === 102, "2 players get 50%/30% floors");
  assert(r2.remainder === 341 - 170 - 102, "remainder 69 stays in pool");
  // 0 players: nothing paid, whole pool stays.
  const r0 = splitTop3(341, 0);
  assert(r0.paid === 0 && r0.remainder === 341, "0 players: pool untouched (341 stays)");
}

// ---------------------------------------------------------------------------
// PAYOUT NEVER EXCEEDS POOL (fold caps payout at pool).
// ---------------------------------------------------------------------------
section("PAYOUT NEVER EXCEEDS POOL");
{
  const evs = [];
  for (let i = 0; i < 10; i++) evs.push({ t: "round" }); // small pool
  const pre = fold(evs);
  const bigPayout = { t: "payout", amount: 99999 };
  evs.push(bigPayout);
  const post = fold(evs);
  console.log(`  pool was ${pre.pool}, requested payout 99999, actually paid ${bigPayout._applied}, pool now ${post.pool}`);
  assert(bigPayout._applied === pre.pool, "payout capped at available pool");
  assert(post.pool === 0, "pool floored at 0, never negative");
  assert(post.dev_earned === pre.dev_earned, "dev_earned unaffected by payout");
}

// ---------------------------------------------------------------------------
// REAL SEED ADD: fills to cap; over-cap excess conserved to dev (not dropped).
// ---------------------------------------------------------------------------
section("REAL SEED ADD: fills to cap, over-cap excess -> dev (conserved)");
{
  // pool=0, add 600 -> 500 fills the pool, 100 conserved to dev (real onions).
  const e = [{ t: "add", amount: 600 }];
  const f = fold(e);
  assert(e[0]._applied === 600, "full 600 settled seed recorded");
  assert(f.pool === 500, "pool fills to the cap (500)");
  assert(f.dev_earned === 100, "over-cap 100 conserved to dev (NOT dropped)");
  // add when pool already full -> all of it conserved to dev.
  const e2 = [{ t: "add", amount: 500 }, { t: "add", amount: 10 }];
  const f2 = fold(e2);
  assert(f2.pool === 500, "pool stays at cap");
  assert(f2.dev_earned === 10, "second add to a full pool -> all 10 to dev");
}

// ---------------------------------------------------------------------------
// DEV SEND CAPPED AT dev_balance; dev_withdrawn rises; balance drops.
// ---------------------------------------------------------------------------
section("DEV SEND CAPPED AT dev_balance");
{
  // Build dev_earned via overflow: fill pool to cap then overflow.
  const evs = [];
  // spentTarget earlier gave dev_earned = rake(spent)+overflow. Reuse a known one.
  for (let i = 0; i < spentTarget / GAME_COST; i++) evs.push({ t: "round" });
  const pre = fold(evs);
  console.log(`  dev_earned=${pre.dev_earned}, dev_balance=${pre.dev_balance}`);
  const send1 = { t: "devsend", amount: 50 };
  evs.push(send1);
  let f = fold(evs);
  assert(send1._applied === 50 && f.dev_balance === pre.dev_balance - 50, "partial dev send 50 drops balance by 50");
  const sendBig = { t: "devsend", amount: 999999 };
  evs.push(sendBig);
  f = fold(evs);
  assert(sendBig._applied === pre.dev_balance - 50, "over-send capped at remaining dev_balance");
  assert(f.dev_balance === 0, "dev_balance floored at 0");
  assert(f.dev_earned === pre.dev_earned, "dev_earned (standing total) unchanged by sends; only dev_withdrawn rose");
}

// ---------------------------------------------------------------------------
// "RESET THE POOL" == a payout event of amount=pool drives pool to 0.
// And dev_earned is untouched. Then play continues filling from 0 again.
// ---------------------------------------------------------------------------
section('"RESET POOL" = payout of amount=pool; dev untouched; refill works');
{
  const evs = [];
  for (let i = 0; i < spentTarget / GAME_COST; i++) evs.push({ t: "round" });
  const pre = fold(evs);
  evs.push({ t: "payout", amount: pre.pool }); // pay out exactly the pool == reset
  const reset = fold(evs);
  assert(reset.pool === 0, "reset drives pool to 0");
  assert(reset.dev_earned === pre.dev_earned, "dev_earned untouched by reset");
  // continue playing: pool refills, rake continues from where spent left off.
  evs.push({ t: "round" });
  const after = fold(evs);
  const rakeDelta = Math.floor((spentTarget + 5) * RAKE) - Math.floor(spentTarget * RAKE);
  assert(after.pool === 5 - rakeDelta, `post-reset round refills pool by inflow (5-${rakeDelta})`);
  assert(after.dev_earned === pre.dev_earned + rakeDelta, "post-reset rake still accrues to dev correctly");
}

// ---------------------------------------------------------------------------
// CONSERVATION INVARIANT (the real safety net): every onion of total_spent
// ends in exactly one place: paid-out pool + current pool + dev_earned (+admin
// adds are external onions, tracked separately). Check across a random log.
// ---------------------------------------------------------------------------
section("CONSERVATION: spent = pool + dev_earned + paid_out (admin adds tracked separately)");
{
  function foldFull(events) {
    let pool = 0, dev_earned = 0, paid_out = 0, added_total = 0, spent = 0;
    for (const e of events) {
      if (e.t === "round") {
        const d = Math.floor((spent + 5) * RAKE) - Math.floor(spent * RAKE);
        spent += 5;
        dev_earned += d;
        const inflow = 5 - d;
        const space = POOL_CAP - pool;
        const toPool = Math.min(inflow, space);
        pool += toPool; dev_earned += inflow - toPool;
      } else if (e.t === "add") {
        const toPool = Math.min(e.amount, POOL_CAP - pool); pool += toPool; dev_earned += e.amount - toPool; added_total += e.amount;
      } else if (e.t === "payout") {
        const p = Math.min(e.amount, pool); pool -= p; paid_out += p;
      }
    }
    return { pool, dev_earned, paid_out, added_total, spent };
  }
  // deterministic pseudo-random log
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let bad = 0;
  for (let trial = 0; trial < 200; trial++) {
    const evs = [];
    const n = 1 + Math.floor(rnd() * 300);
    for (let i = 0; i < n; i++) {
      const r = rnd();
      if (r < 0.7) evs.push({ t: "round" });
      else if (r < 0.85) evs.push({ t: "add", amount: Math.floor(rnd() * 400) });
      else evs.push({ t: "payout", amount: Math.floor(rnd() * 400) });
    }
    const f = foldFull(evs);
    // spent onions split into pool-from-spend + dev + paid-out-that-came-from-spend.
    // Admin adds inflate pool/paid_out, so isolate: pool + paid_out came from spend+adds.
    // Invariant: spent + added_total == pool + dev_earned + paid_out  (every onion accounted)
    if (f.spent + f.added_total !== f.pool + f.dev_earned + f.paid_out) bad++;
    if (f.pool < 0 || f.pool > POOL_CAP) bad++;
    if (f.dev_earned < 0) bad++;
  }
  assert(bad === 0, "over 200 random logs: spent+added == pool+dev_earned+paid_out, 0<=pool<=CAP, dev>=0");
}

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(50)}`);
console.log(`TOTAL: ${checks} checks, ${failures} failures`);
console.log("=".repeat(50));
process.exit(failures === 0 ? 0 : 1);
