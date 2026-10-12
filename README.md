# belongs-to

**Hand it a family's documents. It draws who owns what, and where it goes when someone dies or a company sells. Every box says which page it came from. If the documents don't answer a question, the picture says so instead of making something up.**

![When Sam dies, one rental would likely go through probate court](gallery/fig1-when-sam-dies.png)

Sam and Dana have a trust, two rental LLCs, a 401(k), and an attorney, a CPA and an advisor who have never been in the same room. Sam is fairly sure everything is in the trust. It isn't. One LLC was never moved in, and if Sam dies first, that building goes through probate court while everything else moves without a judge.

belongs-to reads the documents and draws that. Three drawings:

- **Whose name everything is in.** What the trust holds sits in one green zone. Anything that should be in it but isn't gets a red arrow that stops at the edge.
- **What happens when someone dies.** Each thing sits in the band of the mechanism that moves it: a joint account, a beneficiary form, the trust, or the will through probate court. Only the court band looks like a detour, because it is one.
- **What a sale does for QSBS.** For founders: which trust or person owns each block of stock, how much gain each of them can shelter, and which QSBS conditions the paperwork actually proves.

| | |
|---|---|
| ![Whose name everything is in](gallery/fig2-whose-name.png) | ![QSBS stacking](gallery/fig3-qsbs.png) |

## What it won't do

It won't draw what it can't point to. Every card names the document and page it came from. If the paperwork doesn't say who gets the Roth, the card says "no one is named" in red, not "none." If a document was mentioned but never handed over, or was a scan it couldn't read, that shows up on the page too, under "What's missing."

Three limits. If it misreads a page, the drawing will be confidently wrong; that is why every card names its page, so you can check it in thirty seconds. It knows the general rules (how property passes at a death, the QSBS date bands) and says which situations it doesn't cover, such as community property and state probate shortcuts. And it never writes the fix: it tells you an assignment or a beneficiary form would close the gap, and your attorney writes it.

No attorney has reviewed a real family's output yet. How the examples were checked, and what the checks can and can't catch, is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Your documents

Your documents go to whatever model your agent already uses, and nowhere else. This tool has no server and makes no network calls of its own. Before you feed it the real thing, try a redacted set, with names and account numbers blacked out, and check that the citations land on the right pages.

## Install

```bash
npx skills add silverstein/belongs-to
```

Or clone it into your agent's skills folder: `git clone https://github.com/silverstein/belongs-to ~/.claude/skills/belongs-to`. It needs Node 22 or newer, nothing to `npm install`, and Chrome or Chromium only if you want screenshots.

## Use

Tell your agent what you want in plain words:

> Here's our trust, our wills, the LLC agreements and last quarter's statements. Draw whose name everything is in, and what happens if I die first.

It writes down what it read and what it couldn't find, then gives you one HTML file per drawing that opens offline. Hover or tap a card to see what it holds and who holds it. On a phone the figures restack to fit.

Try the three example households first. None of them are real people.

```bash
node scripts/build.mjs examples/ellery/household.json   # a trust, two rental LLCs, one never moved in
node scripts/build.mjs examples/okafor/household.json   # founder stock, three trusts, QSBS caps
node scripts/build.mjs examples/park/household.json     # a 401(k), a Roth, a house, a car, and no will
```

The Park family is the ordinary case: two salaried people with "just" a 401(k) and an IRA. Claude, given only this skill and ten made-up documents, drew it in ten minutes and found seven things worth fixing, starting with the Roth IRA that names no one.

![The Roth IRA, the checking account and the car are in Jordan's name alone](gallery/fig4-park-whose-name.png)

## Export and share

```bash
node scripts/export.mjs out/first-death.html --png fig.png --svg fig.svg --social card.png
```

PNG at 2×, a standalone SVG that opens anywhere with the fonts built in, and a 1080-wide card for a feed. A link like `page.html#focus=birchllc` opens with one card and its connections lit up, so you can point someone at one finding.

## What it is not

It is a picture of what the documents say. It is not legal or tax advice, and an attorney or CPA should look at it before anyone acts on it. It draws structures and events, not cash flow, spending or projections. It covers US rules only.

## License

MIT for the code. The fonts (Newsreader and IBM Plex) are under the SIL Open Font License 1.1, in `kit/fonts/`.
