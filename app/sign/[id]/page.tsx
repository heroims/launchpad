import { cookies } from "next/headers";
import { getRecordById } from "@/lib/launch/repository";
import { messages, type Locale } from "@/lib/i18n/messages";

function t(locale: Locale, key: string): string {
  return messages[locale]?.[key] ?? key;
}

export default async function SignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getRecordById(id);
  const cookieStore = await cookies();
  const locale: Locale = cookieStore.get("launchpad.locale")?.value === "zh" ? "zh" : "en";

  return (
    <main className="page">
      <section className="panel">
        <h1>{t(locale, "result.signTitle")}</h1>
        {record ? (
          <>
            <p>Launch Record: {record.id}</p>
            <p>{t(locale, "form.targetPlatform")}: {record.platform}</p>
            <p>Status: {record.status}</p>
            <p>{t(locale, "result.serviceFee")}: {record.feeAmountLamports} lamports</p>
          </>
        ) : (
          <p className="warning">{t(locale, "sign.notFound")}</p>
        )}
      </section>
    </main>
  );
}
