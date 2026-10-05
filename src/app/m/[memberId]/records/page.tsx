import { memberPage } from "@/lib/member-page";
import { memberDocuments } from "@/lib/data/queries";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { formatDate } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui";
import type { DocumentRow } from "@/lib/data/types";

type Tree = Map<string, Tree | DocumentRow[]>;

function insert(tree: Tree, path: string[], doc: DocumentRow) {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    const leaf = (tree.get(head) as DocumentRow[] | undefined) ?? [];
    leaf.push(doc);
    tree.set(head, leaf);
    return;
  }
  const child = (tree.get(head) as Tree | undefined) ?? new Map();
  tree.set(head, child);
  insert(child, rest, doc);
}

function Branch({ tree, depth }: { tree: Tree; depth: number }) {
  return (
    <ul className={depth ? "ml-4 border-l border-border pl-3" : ""}>
      {[...tree.entries()].map(([name, node]) => (
        <li key={name} className="py-1">
          {Array.isArray(node) ? (
            <details open={depth < 4}>
              <summary className="cursor-pointer text-sm font-medium text-ink">{name} <span className="font-normal text-ink-2">({node.length})</span></summary>
              <ul className="ml-4 border-l border-border pl-3">
                {node.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                    <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="text-accent hover:underline">{d.title ?? documentTypeInfo(d.document_type).label}</a>
                    <span className="text-ink-2">{formatDate(d.document_date)}{d.provider && ` · ${d.provider}`}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <details open={depth < 3}>
              <summary className="cursor-pointer text-sm font-medium text-ink">{name}</summary>
              <Branch tree={node} depth={depth + 1} />
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Documents organised automatically: Health Records → category → type → year → month. */
export default async function RecordsPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, supabase } = await memberPage(params);
  const docs = await memberDocuments(supabase, subject.id);
  const tree: Tree = new Map();
  for (const d of docs) insert(tree, d.filing_path.length ? d.filing_path : ["Health Records", "Other", "Undated"], d);
  return (
    <Card title="Health Records">
      {docs.length === 0 ? <EmptyState title="No health records yet">Uploaded documents are filed here automatically.</EmptyState> : (
        <>
          <p className="mb-3 text-sm text-ink-2">{subject.display_name} → organised automatically by category, type, year and month.</p>
          <Branch tree={tree} depth={0} />
        </>
      )}
    </Card>
  );
}
