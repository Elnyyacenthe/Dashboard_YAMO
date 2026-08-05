import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

import { auth } from "@/auth";
import { rateLimit, RL } from "@/lib/rate-limit";

const f = createUploadthing();

export const ourFileRouter = {
  /** Upload de photos d'annonce (jusqu'à 10 photos, max 5 Mo l'une). */
  adPhotos: f({
    image: { maxFileSize: "8MB", maxFileCount: 10 },
  })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Non authentifié");
      const rl = await rateLimit(`upload:${session.user.id}`, RL.upload);
      if (!rl.success) throw new UploadThingError("Limite d'upload atteinte");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, url: file.url };
    }),

  /** Upload de vidéos d'annonce — courtes (max 30s recommandé). 50 Mo / vidéo, 3 max. */
  adVideos: f({
    video: { maxFileSize: "64MB", maxFileCount: 3 },
  })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Non authentifié");
      const rl = await rateLimit(`upload-vid:${session.user.id}`, { limit: 5, windowMs: 60_000 });
      if (!rl.success) throw new UploadThingError("Limite d'upload vidéo atteinte");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, url: file.url };
    }),

  /** Photo de profil escort. */
  profilePhoto: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Non authentifié");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => ({ uploadedBy: metadata.userId, url: file.url })),

  /** Documents d'identité — recto, verso, selfie (3 fichiers max, 5MB l'un). */
  verificationDocs: f({ image: { maxFileSize: "8MB", maxFileCount: 3 } })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Non authentifié");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => ({ uploadedBy: metadata.userId, url: file.url })),

  /** Pièce jointe messagerie support — image ou document (1 fichier / message). */
  supportAttachment: f({
    image: { maxFileSize: "8MB", maxFileCount: 1 },
    pdf: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Non authentifié");
      const rl = await rateLimit(`upload-support:${session.user.id}`, { limit: 20, windowMs: 10 * 60_000 });
      if (!rl.success) throw new UploadThingError("Limite d'upload atteinte");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => ({
      uploadedBy: metadata.userId,
      url: file.url,
      name: file.name,
    })),

  /** Image de ville — réservé ADMIN. */
  cityImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Non authentifié");
      if (session.user.role !== "ADMIN") throw new UploadThingError("Réservé aux admins");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => ({ uploadedBy: metadata.userId, url: file.url })),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
