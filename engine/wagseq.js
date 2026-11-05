// The words for a WAG's match-time sequences. The numbers (cost, coins, followers, brand, relationships, chance) are in engine/params.js (social.wag.seqs).
// Each kind has two beats; each beat has three options, in the same order as the params. ok = what happens when it works, bad = when it does not.
export const SEQ = {
  content: {
    title: "Filming day",
    icon: "🎬",
    beats: ["The match is on, so the feed is quiet. You have a ring light, an idea and about an hour. What do you shoot?", "The edit is done. How do you put it out?"],
    opts: {
      trend: { name: "Jump on a trend", desc: "Quick, safe, everyone is doing it.", ok: "The trend video took off. Easy money.", bad: "By the time you posted, the trend was over." },
      collab: { name: "Collab with a bigger name", desc: "Bigger pay, bigger risk.", ok: "The collab landed: a bigger audience and a nod from their team.", bad: "They posted first and tagged someone else. You still got a thank-you gift." },
      raw: { name: "Post something honest", desc: "Builds the brand if people take it well.", ok: "Honesty works. People loved the video and the comments are kind.", bad: "It got a lot of comments and not all of them kind." },
      post: { name: "Post it as it is", desc: "Safe, steady.", ok: "A solid post. Steady numbers.", bad: "It went out into a quiet evening." },
      peak: { name: "Post at peak hour with a hook", desc: "Much bigger if it lands.", ok: "The hook worked: people shared it everywhere.", bad: "The timing was a bit off, but it got seen." },
      tag: { name: "Tag a footballer in it", desc: "Warms things with the scene or whoever you see.", ok: "They noticed. A warm reply, and a few more fans.", bad: "They did not reply, and now it looks like you tried too hard." },
    },
  },
  party: {
    title: "A night out",
    icon: "🪩",
    beats: ["You are dressed, the car is outside and the match is on. Where do you go?", "It is late. The night can still go either way."],
    opts: {
      vip: { name: "VIP table", desc: "Costs more; more cameras.", ok: "The table was seen by everyone who matters.", bad: "The VIP section was empty. Still, a few photos." },
      floor: { name: "Dance floor", desc: "Loud, free and reliable.", ok: "A great night on the floor and you are in half the photos.", bad: "Fun, but nobody was filming." },
      bar: { name: "Quiet corner of the bar", desc: "Good for talking to people.", ok: "You had a good talk with the right people.", bad: "Good company, not much happened." },
      live: { name: "Go live from the party", desc: "Big if it works. A disaster if not.", ok: "The live stream got huge. People joined from every club in the league.", bad: "You said the wrong thing live. People are screenshotting it." },
      after: { name: "Afterparty", desc: "Costs a bit; you may meet someone.", ok: "A great afterparty.", bad: "Crowded and dull, but you got some followers." },
      home: { name: "Leave early", desc: "Safe. Nothing lost.", ok: "You got a good night's sleep and a nicer morning.", bad: "" },
    },
  },
  business: {
    title: "Business day",
    icon: "💼",
    beats: ["The shop, the studio or the stand: whatever it is, it has your name on it. The match is on and the phones are quiet. What do you work on?", "The afternoon is yours. What do you do with it?"],
    opts: {
      small: { name: "Order a small batch", desc: "Steady growth.", ok: "The batch sold out quickly.", bad: "The batch was late, but it arrived." },
      big: { name: "Place a big order", desc: "Big growth, if it sells.", ok: "The big order was a smash. The business took a big step.", bad: "The order did not sell. That was an expensive afternoon." },
      lean: { name: "Work on the site yourself", desc: "Free and slow.", ok: "The site looks better. Small progress.", bad: "" },
      ads: { name: "Run an ad", desc: "Costs a little; reaches many.", ok: "The ad ran well. New customers and new followers.", bad: "The ad was seen by a handful of people." },
      hire: { name: "Hire some help", desc: "Costs more; lifts the brand.", ok: "The new hire is a good one. The business feels more serious.", bad: "The first week with the new person is rough." },
      network: { name: "Network at the stalls", desc: "Free; people remember you.", ok: "You made friends who will vouch for you.", bad: "A pleasant chat and nothing more." },
    },
  },
};
export const SEQ_KINDS = Object.keys(SEQ);
