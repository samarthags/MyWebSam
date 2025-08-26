import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function initFirebase() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textSummary(str = "", max = 160) {
  const clean = str.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

function absoluteUrl(req, path = "") {
  const base =
    process.env.SITE_BASE_URL ||
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
  return path ? `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}` : base;
}

export default async function handler(req, res) {
  try {
    initFirebase();
    const db = admin.firestore();

    // Get username from query OR path
    const usernameRaw = (req.query.username || req.url.replace("/", "")).toString().trim().toLowerCase();

    // If root path (no username), show landing page
    if (!usernameRaw) {
      const landingHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Create Your Own Profile - MyPortfolio</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; text-align: center; }
            header { background: #4f46e5; color: #fff; padding: 2rem; }
            h1 { font-size: 2rem; margin: 0; }
            p { color: #444; margin-top: 1rem; }
            .preview { display: flex; flex-wrap: wrap; justify-content: center; margin: 2rem 0; gap: 1rem; }
            .preview img { width: 280px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .btn { display: inline-block; padding: 1rem 2rem; font-size: 1.2rem; background: #4f46e5; color: #fff;
                   border-radius: 8px; text-decoration: none; transition: background 0.3s; }
            .btn:hover { background: #3730a3; }
          </style>
        </head>
        <body>
          <header>
            <h1>Create Your Own Responsive Profile</h1>
            <p>Showcase yourself with a personal page in seconds!</p>
          </header>
          <section class="preview">
            <img src="https://via.placeholder.com/280x180.png?text=Profile+Preview+1" alt="Profile Preview 1">
            <img src="https://via.placeholder.com/280x180.png?text=Profile+Preview+2" alt="Profile Preview 2">
            <img src="https://via.placeholder.com/280x180.png?text=Profile+Preview+3" alt="Profile Preview 3">
          </section>
          <a href="/signup" class="btn">Create Your Web</a>
        </body>
        </html>
      `;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(landingHtml);
    }

    // Otherwise: load user profile
    const snap = await db
      .collection("profiles")
      .where("username", "==", usernameRaw)
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).send("Profile not found");

    const profile = snap.docs[0].data();
    const name = profile.name || usernameRaw;
    const bio = textSummary(profile.bio || "Profile on MyPortfolio");
    const image = profile.imageUrl || "https://via.placeholder.com/1200x630.png?text=MyPortfolio";
    const loc = profile.location || "";
    const birthday = profile.birthday || "";
    const pageUrl = absoluteUrl(req, `/${usernameRaw}`);

    const sameAs = [];
    const add = (cond, url) => cond && sameAs.push(url);
    add(profile.instagram, `https://www.instagram.com/${profile.instagram}`);
    add(profile.snapchat, `https://www.snapchat.com/add/${profile.snapchat}`);
    add(profile.youtubeChannel, `https://www.youtube.com/${profile.youtubeChannel}`);
    add(profile.twitter, `https://twitter.com/${profile.twitter}`);
    add(profile.facebook, `https://facebook.com/${profile.facebook}`);
    add(profile.linkedin, `https://linkedin.com/in/${profile.linkedin}`);
    add(profile.github, `https://github.com/${profile.github}`);
    add(profile.telegram, `https://t.me/${profile.telegram}`);
    add(profile.whatsapp, `https://wa.me/${profile.whatsapp}`);

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Person",
      name,
      description: bio,
      url: pageUrl,
      image,
      ...(loc ? { address: { "@type": "PostalAddress", addressLocality: loc } } : {}),
      ...(sameAs.length ? { sameAs } : {}),
      ...(birthday ? { birthDate: new Date(birthday).toISOString().slice(0, 10) } : {}),
    };

    const templatePath = path.join(process.cwd(), "public", "profile.html");
    let html = fs.readFileSync(templatePath, "utf-8");

    html = html
      .replace(/{{NAME}}/g, escapeHtml(name))
      .replace(/{{BIO}}/g, escapeHtml(bio))
      .replace(/{{IMAGE}}/g, escapeHtml(image))
      .replace(/{{PAGE_URL}}/g, pageUrl)
      .replace(/{{LOCATION_HTML}}/g, loc ? `<p class="meta"><strong>Location:</strong> ${escapeHtml(loc)}</p>` : "")
      .replace(
        /{{BIRTHDAY_HTML}}/g,
        birthday ? `<p class="meta"><strong>Birthday:</strong> ${escapeHtml(new Date(birthday).toDateString())}</p>` : ""
      )
      .replace(/{{JSON_LD}}/g, JSON.stringify(jsonLd));

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
}