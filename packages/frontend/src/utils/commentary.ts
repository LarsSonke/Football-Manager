// Commentary template engine — no API required.
// Templates use {player}, {assist}, {club}, {opp} as placeholders.

export interface CommentaryContext {
  minute: number
  playerName: string | null
  assistName: string | null
  clubName: string
  oppName: string
  homeScore: number
  awayScore: number
  team: 'home' | 'away' | null
  homeClub: string
  awayClub: string
  xg?: number | null
  tactic?: string | null
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function resolve(template: string, ctx: CommentaryContext): string {
  return template
    .replace(/\{player\}/g, ctx.playerName ?? 'The player')
    .replace(/\{assist\}/g, ctx.assistName ?? 'a teammate')
    .replace(/\{club\}/g, ctx.clubName)
    .replace(/\{opp\}/g, ctx.oppName)
}

function isLate(minute: number) { return minute >= 80 }
function isInjuryTime(minute: number) { return minute >= 90 }
function scoreDiff(ctx: CommentaryContext) {
  const myScore = ctx.team === 'home' ? ctx.homeScore : ctx.awayScore
  const oppScore = ctx.team === 'home' ? ctx.awayScore : ctx.homeScore
  return myScore - oppScore
}

// ─── Template pools ───────────────────────────────────────────────────────────

// Goals — tap-in / close range (high xg)
const GOAL_CLOSE = [
  '{player} taps home from close range. Couldn\'t miss.',
  'Right place, right time. {player} finishes coolly inside the six-yard box.',
  '{player} pokes it in at the near post. A poacher\'s instinct.',
  'It falls perfectly for {player} and the finish is emphatic.',
  '{player} is there to convert. Simple, but the movement was superb.',
  'Clinical. {player} takes one touch and rolls it into the corner.',
  'Nobody was picking that up. {player} was first to react.',
  'The keeper had no chance once {player} got in behind. Composed finish.',
  '{player} side-foots it home. It looked easy — it was anything but.',
  '{player} was waiting at the back post. He never misses these.',
]

// Goals — good chance (medium xg, with assist)
const GOAL_ASSISTED = [
  '{assist} picks out {player} and the finish is top corner. What a combination.',
  'The ball from {assist} is perfectly weighted. {player} makes it look effortless.',
  '{assist} with the vision. {player} with the execution. A wonderful team goal.',
  'The pass from {assist} cuts through the defence. {player} doesn\'t need a second invitation.',
  'One touch from {player} to control, another to finish. {assist} did all the hard work.',
  '{assist} finds {player} in space. The angle looked difficult — the finish was not.',
  'Quick feet from {assist} and then a precise ball. {player} finishes first time.',
  '{assist} drives into the box and cuts it back. {player} arrives on cue.',
  'A lovely one-two between {assist} and {player}. The defence was carved open.',
  'The cross from {assist} is pinpoint. {player} meets it perfectly.',
  '{player} holds his run and times it to perfection. {assist} sees it early.',
  'Slick passing, then {assist} threads the needle. {player} finishes clinically.',
]

// Goals — solo effort (medium xg, no assist)
const GOAL_SOLO = [
  '{player} does it all himself. Two defenders beaten before the finish.',
  'Nobody could stop {player} there. He drove at them and finished brilliantly.',
  '{player} picks the ball up deep, carries it thirty metres and slots it home.',
  'Individual brilliance from {player}. The defenders didn\'t get close.',
  '{player} cuts inside and curls it — and it finds the top corner.',
  'There was only one player who was going to score from there. {player} does.',
  'He beats one, beats two, and fires it low into the corner. Sensational from {player}.',
  '{player} drifts in from the left and bends one around the keeper. Stunning.',
  '{player} drives at the defence, creates the space himself, and pulls the trigger.',
  'A dribble that left two men on the floor. {player} with a goal to remember.',
]

// Goals — long range / screamer (low xg)
const GOAL_LONGRANGE = [
  '{player} lets fly from distance — and it screams into the top corner!',
  'Nobody expected that. {player} hits it first time from twenty-five yards.',
  'What audacity from {player}. The goalkeeper is rooted to the spot.',
  'That dips late. The keeper has no chance. {player} with a thunderbolt.',
  '{player} spots the keeper off his line and catches him perfectly.',
  'A half-volley from {player} that the net barely stopped. Outrageous.',
  'The goalkeeper gets a hand to it but the power takes it in anyway. {player} scores.',
  '{player} was miles out. Nobody cared. He hits it, and it flies in.',
  'A speculative strike becomes a moment of genius. {player} has done something special.',
  'There is no explanation for that. {player} just hit it and hoped. Perfect.',
]

// Goals — headers
const GOAL_HEADER = [
  '{player} rises above everyone and powers a header into the net.',
  'The delivery is inch-perfect and {player} makes no mistake with the header.',
  '{player} outjumps his marker and guides it into the far corner.',
  'Dominant in the air, {player} gets above his defender and nods it home.',
  '{player} attacks the cross with intent. The keeper doesn\'t move.',
  'A towering header from {player}. He was the only man going to score that.',
  '{player} peels off his marker, meets the cross, and beats the keeper with his head.',
  'Another corner, another headed goal. {player} is a menace at set pieces.',
]

// Goals — penalty
const GOAL_PENALTY = [
  '{player} steps up. Steady run-up. Low and hard into the corner. Keeper dives the wrong way.',
  'Ice-cold from {player}. He sends the keeper one way and rolls it the other.',
  '{player} with the penalty. He looks at the keeper, picks his spot, scores. No drama.',
  'The goalkeeper goes early but {player} has already decided. Middle of the net.',
  '{player} stutters in his run and the keeper bites. Side-foot into the bottom right.',
  'Penalty scored. {player} doesn\'t mess about — straight down the middle.',
  'High into the roof of the net from {player}. Brave penalty — unbeatable.',
]

// Goals — injury time (contextual)
const GOAL_INJURY_TIME = [
  'Can you believe it?! {player} in injury time! The stadium erupts.',
  'That\'s the last kick. {player} has done it with the clock almost out!',
  'Heartbreak for {ctx.opp}. {player} finds the net right at the death.',
  'It looked like it wouldn\'t come. {player} has found a way.',
  'Deep into added time and {player} delivers. Extraordinary drama.',
  'They refused to give up. {player} rewarded their belief.',
  'Nobody had given up and {player} proves why. A goal for the ages.',
]

// Own goals
const OWN_GOAL = [
  'It deflects off {player} and wrong-foots his own keeper. Cruel.',
  '{player} under pressure — and it goes in off his shin. Calamitous defending.',
  'The ball takes a wicked deflection off {player}. The keeper is stranded.',
  '{player} can\'t believe it. He\'s turned it into his own net.',
  'Unlucky — {player} stretches to clear it and it ends up in the back of the net.',
  'A freak bounce catches {player} out and it loops over the goalkeeper. Bizarre.',
  '{player} is inconsolable. He didn\'t mean that.',
]

// Penalty miss
const PENALTY_MISS = [
  '{player} blazes it over the bar. That\'s a terrible penalty.',
  'The goalkeeper guesses right and gets down to save it. {player} can\'t hide.',
  '{player} hits the post! He\'s sent to his knees.',
  'The keeper reads it perfectly. {player} had gone for power — not direction.',
  '{player} steps up... and hits the crossbar. This could be a decisive miss.',
  'A poor penalty from {player}. The goalkeeper barely has to move.',
  '{player} stutters, the keeper holds his ground, and the ball is saved. Huge miss.',
]

// Yellow cards
const YELLOW_CARD = [
  '{player} catches his man late and the referee has no hesitation.',
  'A mistimed tackle from {player} earns him a booking. He\'ll need to be careful now.',
  '{player} is shown a yellow card for a cynical foul on the edge of the area.',
  'The referee has a word with {player} before producing the yellow card.',
  '{player} protests his innocence but the referee isn\'t interested.',
  'Late challenge from {player}. The crowd react. The referee reaches for his pocket.',
  '{player} tugs back his opponent and the referee makes the decision quickly.',
  'A tactical foul from {player}. He takes the booking to stop the counter.',
  '{player} is booked for time-wasting. The referee has lost patience.',
]

// Red cards
const RED_CARD = [
  '{player} is off. He lunges in recklessly and leaves the referee no choice.',
  'Straight red! {player} is dismissed for a dangerous challenge. {club} are down to ten.',
  'The referee goes to his pocket for the second time — and it\'s red for {player}.',
  'Furious reaction from {player}. He\'ll be watching the next match from the stands.',
  '{player} has let his team down badly. A moment of madness ends his afternoon.',
  'The crowd call for red. The referee agrees. {player} trudges off.',
  'Second yellow, and {player} has to go. {club} will need to reorganise quickly.',
  'A lunge from behind. Dangerous. The referee doesn\'t deliberate — it\'s a red card.',
]

// Substitutions
const SUBSTITUTION = [
  '{player} makes way for {assist}. A change that could shape the game.',
  '{assist} is coming on. The manager wants fresh legs.',
  '{player} is replaced by {assist}. He receives a warm reception leaving the field.',
  'The manager makes a change. {assist} comes on with instructions.',
  '{player} has given everything — {assist} takes his place.',
  '{assist} strips off and gets on. An attacking change from the touchline.',
  'A tactical switch. {player} comes off and {assist} enters the fray.',
  '{player} holds his hamstring as he walks off. Precautionary perhaps. {assist} on.',
  'The crowd applaud {player} as he leaves. {assist} gets a final word from the manager.',
]

// Quiet tick moments — score state based
const TICK_EARLY = [
  'Both sides feeling each other out in the opening exchanges.',
  'A cautious start from both teams. Neither willing to commit.',
  'The game is finding its rhythm. Plenty of shape from both sides.',
  'Possession is being traded without either team creating a clear opening.',
  'An organised start. Both defences have been disciplined so far.',
]

const TICK_HOME_PRESSURE = [
  '{club} are on top. The visitors are struggling to get out.',
  'Another spell of possession for {club}. {opp} are defending deep.',
  'The home side are controlling this. {opp} can barely get the ball.',
  '{club} knocking it about patiently. {opp} sitting in two banks of four.',
  'The pressure from {club} is building. Something has to give.',
]

const TICK_AWAY_PRESSURE = [
  '{opp} are beginning to threaten. {club} need to hold their shape.',
  'The visitors are growing into this. {club} can\'t seem to get the ball.',
  '{opp} carrying a threat on the counter. {club} warned.',
  '{opp} forcing the issue now. The midfield battle is being won.',
  '{club} are being pushed back. The crowd are getting nervous.',
]

const TICK_WINNING = [
  '{club} are managing the game well. Professional stuff.',
  'No need to overcommit. {club} are happy to keep things tight.',
  'The lead is being protected expertly. {club} know how to see a game out.',
  '{opp} are chasing shadows. {club} have this under control.',
  'A composed performance from {club}. Hard to see a way back for {opp}.',
]

const TICK_LOSING = [
  '{club} need a goal. The urgency is building.',
  'The clock is the enemy of {club} now. They need something quickly.',
  '{club} pushing forward but struggling to create the chance they need.',
  'All hands to the pump for {club}. {opp} sitting deep and soaking up pressure.',
  'The crowd are growing restless. {club} are running out of time.',
]

const TICK_LATE_DRAW = [
  'Both managers look nervous on the touchline. A draw suits neither.',
  'There\'s a goal in this — both sides hunting for a winner.',
  'The tempo has increased. Neither team is settling for a point.',
  'End-to-end now. The last team to score wins this.',
  'Barely a break in play. Both sets of players are giving everything.',
]

const TICK_DOMINANT = [
  '{club} are well on top here. {opp} have had nothing.',
  'Complete control from {club}. The stats tell the full story.',
  '{opp} simply can\'t live with {club} tonight.',
  'A masterclass in possession. {club} are dictating every minute.',
  'It could be more. {club} have been ruthless.',
]

const TICK_NEUTRAL_MID = [
  'A tactical battle developing here. Neither side giving an inch.',
  'The game is finely poised. Any goal could change everything.',
  'Plenty of quality on show. This deserves a goal.',
  'Neither goalkeeper has been seriously tested for a while.',
  'The midfield is where this match is being won and lost.',
]

// ─── Main function ────────────────────────────────────────────────────────────

export function getCommentary(
  eventType: string,
  ctx: CommentaryContext,
): string | null {
  let template: string | null = null

  switch (eventType) {
    case 'GOAL': {
      const xg = ctx.xg ?? 0.15
      const late = isInjuryTime(ctx.minute)
      if (late && Math.random() > 0.5) {
        template = pick(GOAL_INJURY_TIME)
      } else if (xg >= 0.70) {
        template = Math.random() > 0.5 ? pick(GOAL_PENALTY) : pick(GOAL_CLOSE)
      } else if (xg < 0.06) {
        template = pick(GOAL_LONGRANGE)
      } else if (ctx.assistName && xg < 0.25) {
        template = Math.random() > 0.3 ? pick(GOAL_ASSISTED) : pick(GOAL_SOLO)
      } else if (xg > 0.35) {
        const r = Math.random()
        if (r < 0.4) template = pick(GOAL_CLOSE)
        else if (r < 0.55) template = pick(GOAL_HEADER)
        else template = pick(ctx.assistName ? GOAL_ASSISTED : GOAL_SOLO)
      } else {
        template = Math.random() > 0.5 ? pick(GOAL_SOLO) : pick(ctx.assistName ? GOAL_ASSISTED : GOAL_CLOSE)
      }
      break
    }
    case 'OWN_GOAL':
      template = pick(OWN_GOAL)
      break
    case 'PENALTY_MISS':
      template = pick(PENALTY_MISS)
      break
    case 'YELLOW_CARD':
      template = pick(YELLOW_CARD)
      break
    case 'RED_CARD':
      template = pick(RED_CARD)
      break
    case 'SUBSTITUTION':
      template = pick(SUBSTITUTION)
      break
    case 'tick': {
      const diff = scoreDiff(ctx)
      const late = isLate(ctx.minute)
      const early = ctx.minute <= 20
      if (early) {
        template = pick(TICK_EARLY)
      } else if (diff >= 2) {
        template = Math.random() > 0.4 ? pick(TICK_WINNING) : pick(TICK_DOMINANT)
      } else if (diff === 1) {
        template = pick(TICK_WINNING)
      } else if (diff <= -1 && late) {
        template = pick(TICK_LOSING)
      } else if (diff === 0 && late) {
        template = pick(TICK_LATE_DRAW)
      } else {
        // Randomly pick pressure or neutral
        const roll = Math.random()
        if (roll < 0.25) template = pick(TICK_HOME_PRESSURE)
        else if (roll < 0.5) template = pick(TICK_AWAY_PRESSURE)
        else template = pick(TICK_NEUTRAL_MID)
      }
      break
    }
    default:
      return null
  }

  if (!template) return null
  return resolve(template, ctx)
}

// ─── Header / footer lines ────────────────────────────────────────────────────

export const KICKOFF_LINES = [
  'The referee blows his whistle. We\'re underway.',
  'Both sides are ready. Let\'s get this started.',
  'Kick off. Ninety minutes — let\'s see what happens.',
  'Here we go. The ball is rolling.',
  'The crowd are loud. The players are ready. Kick off.',
]

export const HALFTIME_LINES = [
  'The referee brings the first half to a close.',
  'Half time. Both managers will have things to say.',
  'That\'s the whistle for half time. Plenty to think about.',
  'Forty-five minutes played. The second half awaits.',
  'Half time. The dressing rooms beckon.',
]

export const FULLTIME_WIN_LINES = [
  'Full time. Three points. Job done.',
  'The final whistle goes and the players celebrate. A well-earned victory.',
  'That\'s it. The win is secured. The manager pumps his fist.',
  'Full time. {club} take all three points.',
  'The referee ends it. {club} deserved that.',
]

export const FULLTIME_DRAW_LINES = [
  'Full time. A point each. Both managers have mixed feelings.',
  'Honours even after ninety minutes.',
  'The final whistle confirms the draw. This one felt like it could have gone either way.',
  'Both sides share the spoils. A fair result, perhaps.',
  'A point apiece. One side will feel they deserved more.',
]

export const FULLTIME_LOSS_LINES = [
  'Full time. A tough day at the office.',
  'The final whistle is hard to take. {club} are beaten.',
  'There\'s no coming back from that now. Defeat confirmed.',
  'The whistle brings an end to it. {club} will reflect on this.',
  'A defeat that will hurt. Back to the drawing board.',
]

export function getKickoff() { return pick(KICKOFF_LINES) }

export function getHalftime() { return pick(HALFTIME_LINES) }

export function getFulltime(result: 'win' | 'draw' | 'loss', clubName: string): string {
  const pool = result === 'win' ? FULLTIME_WIN_LINES : result === 'draw' ? FULLTIME_DRAW_LINES : FULLTIME_LOSS_LINES
  return pick(pool).replace(/\{club\}/g, clubName)
}
