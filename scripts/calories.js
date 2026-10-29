/* Calories from the plan only, no heart rate. Body stats come from secrets (CAL_WEIGHT_LB,
   CAL_HEIGHT_IN, CAL_BIRTHDATE, CAL_GEAR_LB) and never leave the robot: only the running totals
   per day are published, in site/data/calories.json.

   Resting calories per day (Mifflin-St Jeor): 10 x kg + 6.25 x cm - 5 x age + 5 (age on that day).
   Riding calories: miles x 32 + feet climbed x 0.41, scaled by how much heavier the whole outfit is
   than the default gear load. Rest days: resting x 1.4. Ride days: resting + riding. */
const C = require("./lib/common");

function run(ctx) {
  const plan = ctx.plan || C.readData("plan.json", null);
  const weightLb = parseFloat(C.env("CAL_WEIGHT_LB")), heightIn = parseFloat(C.env("CAL_HEIGHT_IN"));
  const birth = Date.parse(C.env("CAL_BIRTHDATE"));
  const cfg = (ctx.config.secretStats || {}).calories || {};
  const gearLb = parseFloat(C.env("CAL_GEAR_LB")) || cfg.gearLbDefault || 66;
  if (!plan || !(weightLb > 0) || !(heightIn > 0) || isNaN(birth)) {
    C.writeData("calories.json", { generated_at: new Date().toISOString(), available: false });
    return { skipped: "CAL_* secrets not set" };
  }
  const kg = weightLb * 0.453592, cm = heightIn * 2.54;
  const massFactor = (weightLb + gearLb) / (weightLb + (cfg.gearLbDefault || 66));
  const milesFactor = cfg.milesFactor || 32, climbFactor = cfg.climbFactor || 0.41, restMult = cfg.restMultiplier || 1.4;
  let total = 0;
  const cumulative = plan.days.map(d => {
    const t = Date.parse(d.date + "T12:00:00Z");
    const age = (t - birth) / (365.25 * 86400000);
    const resting = 10 * kg + 6.25 * cm - 5 * age + 5;
    const riding = ((d.plan_miles || 0) * milesFactor + (d.plan_climb_ft || 0) * climbFactor) * massFactor;
    const isRest = d.kind === "rest" || !(d.plan_miles > 0);
    total += isRest ? resting * restMult : resting + riding;
    return Math.round(total);
  });
  C.writeData("calories.json", { generated_at: new Date().toISOString(), available: true, cumulative_kcal: cumulative });
  C.log(`calories: total over the plan ${Math.round(total).toLocaleString()} kcal`);
  return { newestItemAt: new Date().toISOString() };
}
module.exports = { run };
if (require.main === module) run({ config: C.loadConfig() });
