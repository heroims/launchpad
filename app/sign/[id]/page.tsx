import { getRecordById } from "@/lib/launch/repository";

export default async function SignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getRecordById(id);

  return (
    <main className="page">
      <section className="panel">
        <h1>签名请求</h1>
        {record ? (
          <>
            <p>Launch Record: {record.id}</p>
            <p>平台: {record.platform}</p>
            <p>状态: {record.status}</p>
            <p>服务费: {record.feeAmountLamports} lamports</p>
          </>
        ) : (
          <p className="warning">没有找到这条发射记录。serverless 环境需要持久数据库保存记录。</p>
        )}
      </section>
    </main>
  );
}
