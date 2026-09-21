# Admin product editor UX - 2026-09-16

## Production audit

Inspected the deployed Products list, Add product dialog and an existing product
edit page through the owner's Chrome session. No production form was submitted.
The create dialog constrained the long form to an inner scrollbar and hid the
save action below it; the edit route put stock upload before editable product
information. Create and edit used separate full form implementations.

## Change

Product list and group variant actions now open /admin/products/new, with group
context preserved. The new page and product edit page use ProductEditForm.
Editing opens on product detail; stock upload remains in the existing dedicated
stock route. The action label is Edit, distinct from Gudang. Save is sticky and
visible at the top of the form. Description preview is on demand in both modes.
Price specifies rupiah per unit and shows a readable currency hint; client limits
match the server. Preorder fields enable/require only when checked. Invalid fields
inside collapsed sections open their ancestors before native validation focuses.
Confirmation shows the submitted product name, price and group; creation also
explains the existing Telegram announcement behavior. Dirty drafts warn on tab
close/reload and link navigation. Successful new standalone creation opens its
edit page with the next stock step; grouped creation preserves the group return.
No changes to price snapshots, broadcast fanout policy, inventory or payment logic.

## Validation

939 tests passed, 62 opt-in database/integration tests skipped. TypeScript and
ESLint passed. Existing financial code/schema unchanged; no migration required.
Chrome local preview tested collapsed-field validation, corrected-field review
and successful mocked save. 390px viewport found and fixed rich editor overflow;
measured editor/parent widths both 272px afterwards. Viewport override reset.
Synthetic preview uses mocked submission, never a production API or database.
Backend Linux amd64 Docker image built locally; Azure only loads/runs the image.


## Layout refinement after owner review

The first long-form candidate was transferred but never loaded or deployed.
The final layout groups all fields into Info produk / Media & panduan /
Pengaturan tabs and shows a live name, price, group and preorder summary on the
right. On mobile, that summary becomes a compact sticky save action. Form fields
remain mounted across tabs; invalid fields synchronously reveal the correct tab.
Large nested section boxes and repeated language/section headers were removed
from the initial screen. Desktop and 390px mobile reviewed through Chrome; mobile
page width 375px within a 390px viewport. No production product submission used.

Final three-tab editor: 939 tests pass, including draft preservation after failed
submission and hidden-tab validation; TypeScript and ESLint pass. Local browser
confirmed invalid variant navigation across tabs and no horizontal overflow on
390px mobile. Native viewport reset after review.

Final local image config: sha256:283f27ec7357051120cfe983f2ebed402ca5acc0da6829b334f0579d257206fd.
Final archive checksum: e2ba75907f704c15c87892c45c25ba586ae5525fd3f2f3851cedee2bbb91140f.


## Production acceptance

Final three-tab image deployed to Azure; local build only, verified archive and
rootfs/runtime configuration before promotion. Active image:
sha256:a2c2813ec8c7792a3a1b4a91d228bc7d6134da43bab346ef864841dccc50d01a.
Private config backup: /opt/telegram-store/backups/admin-product-ux-20260916-1789558124.
App healthy, public health passed, scheduler/notification worker running,
production environment and database container unchanged. No migrations.
Chrome production review confirmed /admin/products/new shows the three tabs,
settings navigation works, and an existing product edit opens on Info produk
with the live summary and separate stock shortcut. No production form submitted.
