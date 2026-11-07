import LogoEditor from "../../../components/LogoEditor";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LogoEditor conceptId={id} />;
}
