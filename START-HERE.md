# Sumit Glimpses - final website (no Firebase, no keys)

Client site : index.html      Admin page : admin.html  (or /admin)
Both pages talk to ONE backend (netlify/functions/api.mjs) that stores everything
in Netlify's built-in storage, so they are always connected.

## Put it online (about 5 minutes)

1. Upload ALL files and folders of this zip to a GitHub repository
   (keep the folder `netlify/functions/` exactly as it is, plus package.json and netlify.toml).
2. Netlify > Add new site > Import an existing project > GitHub > choose the repository.
   Leave Build command empty. Publish directory: `.`  > Deploy.
   (If your Netlify site already exists: Site configuration > Build & deploy > Link repository.)
   NOTE: do NOT use "drag and drop" deploy. It cannot install the backend. Use GitHub.
3. Open  https://YOUR-SITE.netlify.app/admin.html
   The first time it asks for the admin Gmail (sumitkr7797@gmail.com) and asks you to CREATE your admin password. Do this right away,
   before sharing the link with anyone. After that it is a normal login.

Optional: instead of creating the password on the page, you can set it in
Netlify > Site configuration > Environment variables > ADMIN_PASSWORD, then redeploy.

## Using it
- Admin: add client name + price + video > "Upload & create code" > send on WhatsApp.
- Client: opens the site > Client Portal > enters code > watches 50% free > pays by UPI
  > sends transaction ID > you press Approve > their page unlocks within ~5 seconds.
- Samples you add in admin appear on the client site automatically.

## Notes
- Large videos upload in 3 MB pieces. Keep the admin page open until it says Created.
- Wrong password 6 times = locked for 10 minutes.
- Netlify free plan has monthly bandwidth/storage limits; many big videos will use them.
