# Nearly: concept

This is the pitch in one page. Edit it by hand; your edited version is the source of truth for the demo and the video. Any line that's a guess says so.

## One line

The till only sees what's in the basket. Our shelf camera sees what people picked up and put back, and turns it into one event stream that the shopper, the brand and the store each see differently. It ends with a price for shelf space that nobody can measure today.

## The person and the decision

**Priya (a persona) runs retail media at a UK grocer.** This week she has to quote a crisps brand for the end-cap by the entrance. Today she prices it from footfall guesses, because nobody measures in-store ads. Nearly gives her measured views and put-backs for that exact end-cap. Her decision is the price on the quote.

The shopper is the second person. They opt in because they get something back: a list of what they nearly bought, and a ping when it drops in price.

## Why it wins

The criteria are creativity, technical implementation and real-world impact.

**Creativity.**
- None of the 85 projects from SF and NY touched retail.
- Companies that already do this, like Standard AI and Aura Vision, sell anonymous heatmaps to the store.
- We link a put-back to a shopper who opted in, and show three parties three different views of the same event, each with its own permissions.

**Technical implementation.**
- The detector proposes, NVIDIA Cosmos checks, and the LLM acts.
- Every event is saved in our own tables with its clip, confidence and latency, and every agent summary cites the events behind it.
- The numbers are honest: seconds per clip, and put-back accuracy on clips we labelled ourselves. The model says "can't tell" instead of guessing.
- The store heatmaps come from NVIDIA's ground truth: 31 people over 13 minutes, including which way each person faces.

**Real-world impact.**
- UK retail media was worth £3.7bn in 2025, up 17.5% (Advertising Association / WARC).
- In-store screens and end-caps are left out of that figure because nobody can measure them in a privacy-safe way.
- Our version is opt-in like cookies, with no face recognition, and brands only see totals once at least 5 shoppers are in them.

## The money arc

The last screen of the demo: **End-cap 3 had 18,400 qualified views this week. At £8 per 1,000 views, that's £147 a week, or about £306k a year across 40 end-caps in one store.**

These are example numbers until we've measured them and someone in retail media has checked the £8 rate (CPM). Never end the demo on a screen of buttons. End on this number.

## The assumptions

1. **Cosmos can tell a take from a put-back on our shelf at least 70% of the time.**
   - Check: 10 takes, 10 put-backs and 3 no-action clips filmed at our table. The gate is 7 of 10 right (CLAUDE.md step 2).
   - Fallback: the demo runs on scripted frames, still showing Cosmos's real answer.
   - Status: **not checked yet.**
2. **Staff let our own clips through the pipeline.**
   - The event says its own footage is welcome and internet video isn't. Uploads stalled for 40+ minutes at SF and NYC, so the direct drop folder is the main route.
   - Status: **not asked yet.** Ask about the NVIDIA store scene at the same time.
3. **Brands and retailers would pay for in-store attention data.**
   - Check: get one quote from someone in retail media (Tesco Media and Insight / dunnhumby, Nectar360, Boots Media Group) or a brand's shopper-marketing team, and put their sentence in the pitch. Ask them about the £8 rate too.
   - Status: **not done.**

## Demo beats

The ★ marks the key moment, where you hold for 3 seconds and say nothing.

0. Opening line, word for word: *"Every till in the country knows what you bought. None of them knows what you nearly bought."*
1. A judge scans the QR card. They're opted in for this visit only.
2. They pick up the crisps, check the price and put them back.
3. The Monitor screen shows Uploaded → Checking with Cosmos → Saved, with the seconds counting.
4. ★ The crisps land on the judge's own phone, and the Brand screen goes up by one put-back. Same event, two views.
5. Their phone gets the ping: "Walkers Salt & Vinegar is £1.10 with Clubcard today."
6. The store heatmap, labelled as NVIDIA's synthetic store.
7. The Price screen: £147 a week.
8. Closing line, word for word: *"That end-cap is worth £147 a week in ads, and right now nobody can sell it, because nobody can measure it."*

If the live path fails, press **G** (jump to the key moment). **R** resets for the next judge.

## Killer questions

**"Isn't this Standard AI or Aura Vision?"**
They sell anonymous heatmaps to the store. We link the put-back to a shopper who opted in and give them something back, which is what keeps them opted in. The brand and store views are the same events with tighter permissions.

**"How accurate is it?"**
On our [N] labelled clips it got [X]% of takes and [Y]% of put-backs right, and said "can't tell" on [Z]% instead of guessing. Here's the Weave run. *(Fill the numbers in from the eval.)*

**"Is this legal in the UK?"**
It's opt-in only, like accepting cookies. Scanning the QR is the consent and the link. There's no face recognition, and brands only see totals once at least 5 shoppers are in them.

**"Is that tracking?"** (the NVIDIA judge)
No. It's one camera and one shopper at a time, and identity comes from the QR scan, not from following people. We haven't measured tracking across cameras, so we don't claim it.

## Risks and cut order

**What's most likely to fail, and the fallback for each:**
- Cosmos misreading put-backs: scripted frames, with Cosmos's real answer shown.
- Uploads stalling: the direct drop folder.
- VastDB refusing our writes: the same rows in JSON files.
- W&B being slow: outputs written in advance, plus a fixed fallback sentence.

**Cut in this order:**
1. The other use cases (keep them as one slide)
2. The attention heatmap
3. The camera handoff
4. The footfall heatmap

**Never cut.** These are the argument: one camera, one shelf, a live take and put-back, the saved event, the shopper's list, the brand's totals, and the money screen.

## Honest odds

**Guess: about 1 in 5 to place.**
- The biggest lever is a real, measured put-back accuracy on our own clips, plus one quote from someone who sells retail media.
- The next one is showing VAST's own platform carrying the permissions and history, instead of only our API.
