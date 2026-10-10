# Al-Wassouf REST API

Base path: API listens on port `4000` by default. The web app forwards `/api/:path*` through a Next.js rewrite. All write requests from the dashboard send `x-admin-request: 1`; browser clients use same-origin relative URLs.

## Authentication

- `POST /api/admin/auth/login` — JSON `{ "username": string, "password": string }`; sets an HttpOnly, SameSite=Lax session cookie. In production the cookie is Secure and uses the `__Host-` prefix. Login errors do not reveal whether a username exists; failed attempts are rate-limited.
- `POST /api/admin/auth/logout` — clears the session cookie; requires `x-admin-request: 1`.
- `GET /api/admin/me` — returns the current administrator and permission list.
- `PUT /api/admin/account/password` — `{ "currentPassword": string, "newPassword": string }`; new password must contain 12–128 characters and invalidates existing sessions.

`SESSION_SECRET` is required and must contain at least 32 bytes. Passwords are stored as salted scrypt hashes. Admin rows are checked against the database on every protected request; active status, role and session version are not trusted from the token. All mutation routes require the custom same-site request header and enforce permissions server-side.

Roles: `owner`, `admin`, `editor`, `inventory_manager`. `owner` alone may call the legacy product DELETE endpoint (which archives without erasing its product, image or inventory data) and manage admin accounts. See the permission matrix in `packages/shared/src/index.ts`.

## Public endpoints

- `GET /health` — `{ status, timestamp }`
- `GET /api/settings/public` — public store identity, price/quantity flags, contact details, channel links and optional hero image.
- `GET /api/products?q&brand&branch&availability&minPrice&maxPrice&page&pageSize` — one catalog document per phone with availability nested by active branch; only published records are included. Prices and quantities respect store settings.
- `GET /api/products/latest?limit=` — latest published products.
- `GET /api/products/suggest?q=` — suggestions and up to five products.
- `GET /api/products/:code` — published product detail.
- `GET /api/brands` — published brand counts.
- `GET /api/branches` — active branch contact information.
- `GET /api/offers/public` — active offers within their start/end dates.
- `GET /api/media/:filename` — streams a locally stored image with immutable cache headers. Only UUID filenames and known image extensions are accepted.
- `POST /api/analytics/event` — `{ type: 'search' | 'whatsapp_click' | 'product_view', term?, productCode?, branchCode? }`; no visitor identity is stored.

## Admin catalog and inventory

All routes below require a valid session and the listed permission.

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/admin/products?q&status&page&pageSize&branch` | `product:read` | Search and list draft/published/hidden/archived products with image and inventory summaries. |
| `GET /api/admin/products/:id` | `product:read` | Full editable product data and branch inventory. |
| `POST /api/admin/products` | `product:create` | Create a draft; body includes name, brand, model, description, optional price, currency, specifications, `isFeatured`, and optional `inventory[]`. The API assigns a unique `WSF-xxxxxx` product code. |
| `PUT /api/admin/products/:id` | `product:edit` | Update product metadata and optionally upsert the per-branch inventory array. |
| `PUT /api/admin/products/:id/status` | `product:visibility` or `product:archive` | Body `{ status: 'draft'|'published'|'hidden'|'archived' }`. Archiving requires `product:archive`. |
| `DELETE /api/admin/products/:id` | `product:delete` | Owner-only compatibility endpoint that archives the product; its product, images and inventory records are retained. |
| `PUT /api/admin/products/:id/inventory` | `inventory:edit` | `{ branchCode, availabilityStatus, quantity? }`; status is `in_stock`, `out_of_stock`, or `ask_to_confirm`; quantity is an optional non-negative integer. |
| `POST /api/admin/products/:id/images` | `product:edit` | Multipart field `images`, maximum 8 files per request. Returns saved local image records. |
| `DELETE /api/admin/products/:id/images/:filename` | `product:edit` | Detach an image and remove its file when it is no longer referenced. |

Duplicate product identity is checked using normalized brand + model (or name when model is empty). Use one product document for each phone and its Inventory rows for individual branches; repeated branch codes in one inventory request are rejected.

## Branches, settings, offers and files

- `GET /api/admin/branches` — `branch:read`
- `POST /api/admin/branches` — `branch:edit`; accepts branchCode, name/address, WhatsApp/country code, phone/email/contactInfo, channelLinks, mapsUrl, imageUrl, isActive.
- `PUT /api/admin/branches/:code` — `branch:edit`
- `DELETE /api/admin/branches/:code` — `branch:edit`; returns conflict when inventory records exist. Deactivate a branch instead to keep inventory history.
- `GET /api/admin/settings`, `PUT /api/admin/settings` — `settings:edit`; store name/about, currency, default country code, price/quantity flags, contact information, channel links, hero image and optional WhatsApp channel display.
- `POST /api/admin/uploads` — `settings:edit`; multipart field `image`, returns `{ id, url, size, mimeType }` for local store/offer imagery.
- `DELETE /api/admin/uploads/:filename` — `settings:edit`; only deletes an unreferenced local image.
- `GET /api/admin/offers`, `POST /api/admin/offers`, `PUT /api/admin/offers/:id`, `DELETE /api/admin/offers/:id` — `offers:edit`; title, description, local image URL, CTA, active flag and optional start/end dates.

Uploads accept JPEG, PNG, WebP and GIF only, enforce file-signature verification, decode and re-encode images with Sharp, cap dimensions at 40 megapixels and enforce an 8 MiB per-file limit. SVG, executable files and remote image URLs are not accepted as uploaded media. Set `MEDIA_DIR` to persistent storage in production.

## Statistics, audit and team management

- `GET /api/admin/stats` — `stats:view`; daily searches, WhatsApp clicks, published products, brands, active branches/offers/admins and top searches.
- `GET /api/admin/audit-logs?page&pageSize&action` — `stats:view`; newest actions first.
- `GET /api/admin/admins` — `admins:manage` (owner only).
- `POST /api/admin/admins` — `admins:manage`; `{ username, password, displayName, role }`.
- `PUT /api/admin/admins/:id` — `admins:manage`; updates displayName, role, active status or optional password. The final active owner cannot be demoted or disabled.
- `DELETE /api/admin/admins/:id` — `admins:manage`; deactivates account and increments session version. The current user cannot deactivate itself.

## Validation and storage notes

Handlers construct allowlisted update objects and validate lengths, roles, status values, URLs, email, quantities and specifications on the server. Product/branch schemas retain older unknown fields to make migration non-destructive. Legacy Telegram-hosted product and branch images can be copied once with `npm run migrate:legacy-media` while `TELEGRAM_BOT_TOKEN` is temporarily available; the script retains the old media records and reports unavailable files. Remove the temporary token after migration. Legacy image pointers that cannot be imported are not returned to the public site; the associated product remains intact and can be repaired by uploading the image again.
