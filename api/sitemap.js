// api/sitemap.js
import admin from "firebase-admin";

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

function absoluteBase(req) {
  return (
    process.env.SITE_BASE_URL ||
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`
  );
}

// Reserved paths we don’t want in sitemap
const RESERVED = new Set(["api", "signup", "sitemap.xml"]);

export default async function handler(req, res) {
  try {
    initFirebase();
    const db = admin.firestore();

    // If you store timestamps, make sure they are saved as Firestore Timestamps
    const profilesSnap = await db
      .collection("profiles")
      .select("username", "updatedAt")
      .get();

    const base = absoluteBase(req).replace(/\/+$/, "");
    const urls = [];

    profilesSnap.forEach((doc) => {
      const data = doc.data();
      if (!data?.username) return;

      const username = String(data.username).toLowerCase();
      if (RESERVED.has(username)) return; // skip unwanted routes

      const loc = `${base}/${encodeURIComponent(username)}`;

      // Handle lastmod if available
      let lastmod = new Date();
      if (data.updatedAt?.toDate) {
        lastmod = data.updatedAt.toDate();
      }

      urls.push(
        `<url>
          <loc>${loc}</loc>
          <lastmod>${lastmod.toISOString().split("T")[0]}</lastmod>
          <changefreq>weekly</changefreq>
          <priority>0.8</priority>
        </url>`
      );
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Sitemap error");
  }
}