# Two minute demo

Use the saved live 7 traces and packets from commit `6019c1a7f762effed0926c7b8c811fea26c3a97a`. Start with Ellery's source page, then show the question, answer, and packet in order. The full cases ran from about two minutes and forty-five seconds to just over four minutes. Cut the waiting time for the demo.

| Time | On screen | Say | Saved evidence |
| --- | --- | --- | --- |
| 0:00 to 0:15 | Open Schedule A on page 6 of the Birch Avenue LLC operating agreement. Highlight “Sam Ellery, individual member, 100 percent.” | “Page six lists Sam Ellery as the only member of Birch Avenue LLC. The family also has a trust. Let’s see which papers connect each company to the trust.” | Ellery packet, `household.json` and its cited fictional source `examples/ellery/documents/birch-oa.md`, page 6. |
| 0:15 to 0:31 | Show the single Ellery review question, “Do you have papers that would settle any of these?” Highlight “Who is named to receive Dana's IRA” and “Assignment of Birch Avenue LLC to the trust.” Show the recorded **Show the pages** answer, then the returned file list. | “Eve asks once about the missing papers. The list includes Dana’s IRA beneficiary form and any assignment of Birch Avenue LLC to the trust. The recorded answer is Show the pages.” | Ellery review trace and packet file list. |
| 0:31 to 0:45 | Open the ownership page at “The trust holds the house and Elm Street Rentals LLC, but the documents show Birch Avenue LLC in Sam's name.” Zoom in on the Birch card and its page citation. | “The trust holds the house and Elm Street Rentals LLC. Birch Avenue LLC is in Sam’s name. The ownership page puts the signed membership schedule beside the card.” | Ellery packet, `whose-name.html`. |
| 0:45 to 1:00 | Open the death page at “If Sam dies, most of it reaches Dana or the trust without court, but Birch Avenue LLC goes to court first.” Follow Birch through the court band and show the $740K card. | “Birch Avenue LLC goes to court first. The card shows seven hundred forty thousand dollars. The joint brokerage and Sam’s 401(k) go directly to Dana.” | Ellery packet, `at-a-death.html`. |
| 1:00 to 1:15 | Open the Okafor death page at “The documents don't show who takes Maya's interest in Okafor Holdings LLC if Maya dies.” Point to the note asking for the full operating agreement. | “Maya’s papers leave out the section on what happens when a member dies. The death page leaves the destination open and tells the family which section to get.” | Okafor packet, `at-a-death.html`. |
| 1:15 to 1:31 | Open the Okafor QSBS page at “A sample sale would count three taxpayers separately for QSBS: Maya, the Ada trust and the Theo trust.” Highlight the $12.00 sample share price, $26.8M, and the gross-assets checklist item. | “At twelve dollars a share, the sample shows twenty-six point eight million dollars in possible exclusions across three taxpayers, if Tallgrass qualifies. The checklist shows which records still matter.” | Okafor packet, `qsbs.html`. |
| 1:31 to 1:47 | Open the Park death page. Highlight the $89K Roth IRA card and the headline ending “three things go to court first.” Switch to the Roth note on the ownership page and point to the line about naming Casey. | “Three items go to court first, including Jordan’s Roth IRA, shown at about eighty-nine thousand dollars. The ownership note gives Jordan a next step for the Roth.” | Park packet, `at-a-death.html` and `whose-name.html`. |
| 1:47 to 2:00 | Show the three packet folders with their HTML and `household.json`. Put the recorded case times on screen as **Ellery 3m57s · Okafor 4m14s · Park 2m45s**. | “These are the full case times. Eve runs in your Vercel project, and the model reads through AI Gateway. The pages and cited household model are yours to keep.” | All three packets and the live 7 timing records below. |

## Saved sources

Paths beginning with `live-7/` and `round-7/` are relative to the challenge evidence directory `belongs-to-eve-evidence`. Paths under `.eve/` are relative to the repository's `eve/` directory.

| Source | File or directory |
| --- | --- |
| Ellery packet | `live-7/packet/wrun_01M89QSJWWW4Q0C06QVV9T1ER3/toolu_01CnBjn6GnKGUYixgYD7J216/` |
| Ellery review trace | `.eve/evals/2026-11-25T16-25-31/evals/households/0000.events.ndjson`, `finish_review` |
| Okafor packet | `live-7/packet/wrun_01M89R0T5J4DC8TJPE4975TPYG/toolu_017na5Hv3ccNtJCt5FjinhHs/` |
| Park packet | `live-7/packet/wrun_01M89R8JKTEWZWJZW1YZS2CJRM/toolu_01UCtqhAM1dxgKWYGEBwp4Ku/` |
| Case times, questions, answers, and packet files | `round-7/video-evidence.json`, extracted from the three cases in `.eve/evals/2026-11-25T16-25-31/evals/households/` |
| Live 7 run log | `live-7/live-all-7.log` |
