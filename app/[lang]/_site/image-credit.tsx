import { getI18n } from "@/lib/i18n";

// Shown wherever official card images are.
export async function ImageCredit() {
  const { t } = await getI18n();
  return <footer className="container pb-8 text-xs text-muted-foreground">{t.site.imageCredit}</footer>;
}
