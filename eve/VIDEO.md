# Two minute demo

Use the saved live run traces and packet files below. Keep the take labels visible when switching between Ellery's intake question and the completed Ellery review. Trim the waits and keep the answers and results in order. The recorded runs took about two to four minutes per family.

| Time | On screen | Say | Saved evidence |
| --- | --- | --- | --- |
| 0:00 to 0:15 | Open the Ellery ownership page at “Birch Avenue LLC's records show Sam as its only member, not the trust.” Show Schedule A, page 6, beside the card. Highlight “Sam Ellery, individual member, 100 percent.” | “Page six says Sam Ellery owns all of Birch Avenue LLC. The ownership page puts that source beside the card. What happens to the company when Sam dies is a different question.” | Ellery packet, `whose-name.html`. Fictional source `examples/ellery/documents/birch-oa.md`, page 6. |
| 0:15 to 0:29 | Label the cut **Ellery intake, live 6**. Show the recorded question “Before I draw this, which state do you live in? Sam's will says Ohio, so I'll use Ohio unless you tell me otherwise.” Highlight **Ohio (Recommended)** beside **Different state**. | “On a separate take, Eve checked whether Ohio was current. Sam’s will gives Ohio. If the family lives somewhere else now, this is where the family can say so.” | Ellery intake trace below. |
| 0:29 to 0:44 | Label the cut **Ellery completed review, live 5**. Show the one recorded review question and its list. Highlight who receives Dana’s IRA and the assignment of Birch Avenue LLC to the trust. Show the recorded **Show the pages** answer, then the returned file list. | “In the completed take, Eve asked once about the missing papers. The list included Dana’s IRA beneficiary form and any assignment of Birch Avenue LLC to the trust. The answer was Show the pages.” | Ellery review trace and Ellery packet, `at-a-death.html`. |
| 0:44 to 1:00 | Open the Ellery death page at “If Sam dies, most of it reaches Dana or the trust without court, but Birch Avenue LLC goes through probate first.” Follow Birch through the court band and show the $740K card. | “Birch Avenue LLC goes through probate first. The card shows seven hundred forty thousand dollars. The joint brokerage and Sam’s 401(k) go directly to Dana.” | Ellery packet, `at-a-death.html`. |
| 1:00 to 1:15 | Open the Okafor death page. Show “The documents don't show where Maya's interest in Okafor Holdings LLC goes when she dies.” Point to the card and the note about the missing part of the operating agreement. | “Maya’s papers leave out the section on what happens when a member dies. The death page leaves the destination open and tells the family which section to get.” | Okafor packet, `at-a-death.html`. |
| 1:15 to 1:31 | Show the Okafor QSBS headline “If Tallgrass qualifies, the example sale puts Maya over her QSBS limit and each trust under its own.” Highlight the $12.00 example share price, $26.8M, and the unchecked gross-assets item. | “At twelve dollars a share, up to twenty-six point eight million dollars could be excluded across three taxpayers if Tallgrass qualifies. The ledger shows which records we still need.” | Okafor packet, `qsbs.html`. |
| 1:31 to 1:47 | Open the Park death page. Highlight the $89K Roth IRA card and the headline ending “three things wait on probate.” Then open the task about naming a beneficiary. | “Here, three items wait on probate, including Jordan’s Roth IRA, shown at about eighty-nine thousand dollars. The next step on the packet is to name someone on that account.” | Park packet, `at-a-death.html` and `what-to-do.html`. |
| 1:47 to 2:00 | Show the three packet folders with their HTML and `household.json`. Put the recorded times on screen as **Ellery 1m53s · Okafor 3m49s · Park 2m00s**. | “The full runs took about two to four minutes per family. Eve runs in your Vercel project and the model reads through AI Gateway. The pages and cited household model are yours to keep.” | All three packets and the timing records below. |

## Saved sources

Paths beginning with `live-` are relative to the challenge evidence directory `belongs-to-eve-evidence`. Paths under `.eve/` are relative to the repository's `eve/` directory.
The evidence directory also holds `round-6/video-evidence.json` with the saved questions, answers, timings, and packet file lists.

| Source | File or directory |
| --- | --- |
| Ellery packet | `live-5/packet/wrun_01M89P6HKCTFGEQ0S6Z3ZRSVK2/toolu_01XUXJ5UyzhZw5Ao2V2c1MDH/` |
| Ellery intake trace | `.eve/evals/2026-11-25T15-56-09/evals/households/0000.events.ndjson`, `ask_question` |
| Ellery review trace and timing | `.eve/evals/2026-11-25T15-48-36/evals/households/0000.json` and `live-5/live-ellery-5.log` |
| Okafor packet | `live-6/packet/wrun_01M89PD65PH9WJ4SEXDF4KSY61/toolu_01TTqa9bUX2Qfw2t1sMoBE54/` |
| Park packet | `live-6/packet/wrun_01M89PM5MDC1Y8YSG51599J6QQ/toolu_01UYiHtEFowei1vHhcC3NS3o/` |
| Okafor and Park timing | `.eve/evals/2026-11-25T15-56-09/evals/households/0001.json` and `.eve/evals/2026-11-25T15-56-09/evals/households/0002.json`, using the case start and finish timestamps |
