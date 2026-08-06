import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { CityRow } from "./_city-row";
import { NewCityButton } from "./_new-city-button";

export default async function AdminCitiesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/admin");

  const cities = await prisma.city.findMany({
    orderBy: [{ isPopular: "desc" }, { order: "asc" }],
    include: { _count: { select: { ads: { where: { status: "ACTIVE" } } } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Villes</h1>
          <p className="text-muted-foreground">
            {cities.length} villes — éditez les images, descriptions, ordre d'affichage
          </p>
        </div>
        <NewCityButton />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            {cities.map((c) => (
              <CityRow
                key={c.id}
                city={{
                  id: c.id,
                  name: c.name,
                  slug: c.slug,
                  region: c.region,
                  description: c.description,
                  imageUrl: c.imageUrl,
                  isPopular: c.isPopular,
                  order: c.order,
                  adCount: c._count.ads,
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
