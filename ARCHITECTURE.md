# Al-Wassouf architecture

The repository is an npm-workspaces monorepo with three maintained workspaces:

- `packages/shared`: public DTOs, role permissions and Arabic/Latin search helpers.
- `apps/api`: NestJS, MongoDB/Mongoose, authentication, file storage and JSON API.
- `apps/web`: Next.js App Router, Arabic RTL public store and administrative dashboard.

There is no separate chat-bot application. The dashboard at `/admin` is the administration interface for all store operations.

## Data model and migration strategy

The API registers Product, Branch, Inventory, Admin, StoreSettings, Offer, AnalyticsEvent, AuditLog and Counter models. Product and branch schemas use `strict: false` to preserve fields written by prior releases. Initialization is additive: it never drops product, branch, settings or inventory records. `npm run seed` only creates/updates the first owner, inserts default branches/settings when missing, synchronizes the product-code counter, and removes the legacy unique Telegram-user index from the admin collection so username accounts can coexist. Legacy admin rows and old media metadata are not deleted. If old product photos still point at Telegram, `npm run migrate:legacy-media` can copy them once to `MEDIA_DIR` before the old token is removed; the normal API and website have no Telegram runtime dependency.

Products are global catalog records with a unique `productCode` and a single metadata record. Per-branch quantities/statuses live in Inventory, keyed by product and branch code. The API returns a product once and decorates it with branch availability; it never creates one public card per branch. Creation/update checks a normalized brand + model/name identity to reject an active duplicate.

Product images are local UUID-named files in `MEDIA_DIR` (default `apps/api/uploads`). MongoDB stores only the image URL and safe metadata. `GET /api/media/:filename` serves only UUID filenames with known extensions. The product metadata update route does not replace old image references; new uploads append local assets. An external image reference which cannot be read locally remains on its product record but is omitted from public image results until an administrator re-uploads that image.

## API

Public routes:

- `GET /health`
- `GET /api/settings/public`
- `GET /api/products`, `/api/products/latest`, `/api/products/suggest`, `/api/products/:code`
- `GET /api/brands`, `/api/branches`, `/api/offers/public`
- `GET /api/media/:filename`
- `POST /api/analytics/event`

Admin routes use the HttpOnly session cookie issued by `POST /api/admin/auth/login`, same-site request header `x-admin-request: 1` for mutations, and role checks on every request. `POST /api/admin/auth/logout` clears the cookie. Admin routes include:

- `/api/admin/me`, `/api/admin/account/password`
- `/api/admin/products` — list/detail/create/update/status/delete, image upload/removal, inventory updates
- `/api/admin/branches` — list/create/update/delete (deletion is refused while inventory records exist; deactivate instead)
- `/api/admin/settings`, `/api/admin/uploads`
- `/api/admin/offers`
- `/api/admin/stats`, `/api/admin/audit-logs`
- `/api/admin/admins` — owner-only team management

All JSON write handlers validate and whitelist accepted fields. File upload accepts only JPEG, PNG, WebP and GIF, checks file signatures, limits each image to 8 MiB, and limits a product request to 8 images. SVG and arbitrary file upload are not supported.

## Roles

`owner` has all permissions including product deletion and team management. `admin` manages catalog, visibility, inventory, branches, offers and settings. `editor` manages products and inventory but cannot administer branches/settings or accounts. `inventory_manager` reads the catalog/branches and changes availability only. Server-side permission checks remain authoritative even if the dashboard is modified in the browser.

## Authentication and operations

- Password hashes use scrypt with a random salt; login failures are rate-limited in-process.
- Session tokens are HMAC-SHA256 signed, expire after 12 hours, and carry a session version. Deactivating an account or changing its password invalidates previous sessions.
- Cookie is HttpOnly and SameSite=Lax; production uses Secure and a `__Host-` cookie name.
- `SESSION_SECRET` must be a random secret of at least 32 bytes. `npm run seed` requires it plus an initial `ADMIN_PASSWORD` of at least 12 characters.
- Put a reverse proxy/TLS termination in front of production, restrict MongoDB network access, persist `MEDIA_DIR`, and back up MongoDB and that directory together.
- Next.js rewrites `/api/:path*` to the server-side `API_BASE_URL`; browser JavaScript only uses relative paths, so it never calls a browser-localhost API.

## Web

Public site routes are `/`, `/search`, `/brands`, `/branches`, and `/product/:code`. The `/admin` route renders the login form or the permission-aware responsive dashboard. `SiteFrame` hides public navigation/footer in the administration area. The RTL public store and dashboard share the light blue/cyan/purple palette. Product details render uploaded gallery images and branch availability; active offers are shown on the home page.

The Footer keeps the exact attribution text `Designed by Cyriux` as a clickable link to `https://cyriux.com`. The logo asset remains separate from the storefront photograph and is optimized to a pure `#FFFFFF` background under the 512 KB limit.
