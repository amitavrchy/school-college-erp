'use client';
import { useState } from 'react';
import { BookOpen, Clock, Library as LibraryIcon, Plus, Users } from 'lucide-react';
import { useCampus } from '@/components/shell';
import { ModuleGate } from '@/components/module-gate';
import {
  Badge,
  Button,
  Field,
  FormModal,
  PageTitle,
  Panel,
  SearchBox,
  Stat,
  State,
  Toast,
} from '@/components/ui';
import { useData } from '@/lib/use-data';
import { bdt, dayKey, displayDate, post } from '@/lib/api';
export default function Library() {
  return (
    <ModuleGate feature="library">
      <LibraryContent />
    </ModuleGate>
  );
}
function LibraryContent() {
  const { can } = useCampus(),
    staff = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL', 'LIBRARIAN');
  const { data: books, error, loading, reload } = useData('library/books'),
    { data: loans, reload: reloadLoans } = useData('library/loans'),
    { data: reservations, reload: reloadReservations } = useData('library/reservations');
  const [tab, setTab] = useState('Catalog'),
    [search, setSearch] = useState(''),
    [modal, setModal] = useState<any>(null),
    [toast, setToast] = useState('');
  async function refresh() {
    await Promise.all([reload(), reloadLoans(), reloadReservations()]);
  }
  async function action(path: string, body: unknown) {
    try {
      await post(path, body);
      await refresh();
      setToast('Library records updated');
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const filtered =
    books?.filter((b: any) =>
      `${b.title} ${b.author} ${b.category} ${b.isbn || ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const fields: Field[] =
    modal?.type === 'book'
      ? [
          { key: 'title', label: 'Book title' },
          { key: 'author', label: 'Author' },
          { key: 'isbn', label: 'ISBN', required: false },
          { key: 'category', label: 'Category' },
          { key: 'shelf', label: 'Shelf', required: false },
          {
            key: 'totalCopies',
            label: 'Number of copies',
            type: 'number',
            min: 1,
            defaultValue: 1,
          },
          {
            key: 'replacement',
            label: 'Replacement value per copy (BDT)',
            type: 'number',
            min: 0,
            defaultValue: 0,
          },
        ]
      : modal?.type === 'issue'
        ? [
            { key: 'studentId', label: 'Borrower', remote: 'students' },
            { key: 'dueDate', label: 'Due date', type: 'date' },
          ]
        : modal?.type === 'stock'
          ? [
              {
                key: 'totalCopies',
                label: 'Total copies including borrowed and lost',
                type: 'number',
                min: 1,
                defaultValue: modal.book.totalCopies,
              },
              {
                key: 'shelf',
                label: 'Shelf',
                required: false,
                defaultValue: modal.book.shelf || '',
              },
            ]
          : modal?.type === 'reserve'
            ? [{ key: 'studentId', label: 'Learner', remote: 'students' }]
            : [
                {
                  key: 'confirmation',
                  label: 'Type LOST to charge the replacement value to the learner’s fee ledger',
                },
              ];
  return (
    <>
      <PageTitle
        title="A place for every good book."
        eyebrow="LIBRARY & CIRCULATION"
        description="Catalog, circulation, reservations and overdue charges, connected to the learner’s record."
      >
        {staff && (
          <Button onClick={() => setModal({ type: 'book' })}>
            <Plus size={16} />
            Add a book
          </Button>
        )}
      </PageTitle>
      <div className="stats-grid">
        <Stat
          label="Catalog titles"
          value={books?.length || 0}
          note="In this campus library"
          icon={<LibraryIcon size={18} />}
          color="blue"
        />
        <Stat
          label="Available copies"
          value={books?.reduce((s: number, b: any) => s + b.totalCopies - b._count.loans, 0) || 0}
          note="Excludes borrowed and lost copies"
          icon={<BookOpen size={18} />}
          color="green"
        />
        <Stat
          label="Active loans"
          value={loans?.filter((l: any) => l.status === 'BORROWED').length || 0}
          note="Across the accessible loan register"
          icon={<Users size={18} />}
          color="amber"
        />
        <Stat
          label="Overdue"
          value={
            loans?.filter((l: any) => l.status === 'BORROWED' && l.dueDate.slice(0, 10) < dayKey())
              .length || 0
          }
          note="Fine is calculated on return"
          icon={<Clock size={18} />}
          color="purple"
        />
      </div>
      <Panel>
        <div className="toolbar">
          <div className="segmented">
            {['Catalog', 'Loans', 'Reservations'].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={tab === t ? 'selected' : ''}>
                {t}
              </button>
            ))}
          </div>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Find a book, author or category…"
          />
        </div>
        {loading || error ? (
          <State loading={loading} error={error} onRetry={reload} />
        ) : tab === 'Catalog' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title / author</th>
                  <th>Category / shelf</th>
                  <th>Available</th>
                  <th>Queue</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b: any) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.title}</strong>
                      <div>
                        {b.author}
                        {b.isbn ? ` · ${b.isbn}` : ''}
                      </div>
                    </td>
                    <td>
                      {b.category}
                      <div>{b.shelf || 'Unassigned'}</div>
                    </td>
                    <td>
                      <Badge>{`${b.totalCopies - b._count.loans} / ${b.totalCopies} copies`}</Badge>
                    </td>
                    <td>{b._count.reservations} waiting</td>
                    <td>
                      <div className="inline-actions">
                        {staff && (
                          <Button
                            variant="ghost"
                            disabled={b.totalCopies <= b._count.loans}
                            onClick={() => setModal({ type: 'issue', book: b })}
                          >
                            Issue copy
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => setModal({ type: 'reserve', book: b })}
                        >
                          Reserve
                        </Button>
                        {staff && (
                          <Button
                            variant="ghost"
                            onClick={() => setModal({ type: 'stock', book: b })}
                          >
                            Stock
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <State empty />}
          </div>
        ) : tab === 'Loans' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Borrower</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Charge</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loans?.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.book.title}</strong>
                    </td>
                    <td>
                      {l.student.fullName}
                      <div>{l.student.studentCode}</div>
                    </td>
                    <td>{displayDate(l.dueDate)}</td>
                    <td>
                      <Badge
                        tone={
                          l.status === 'BORROWED' && l.dueDate.slice(0, 10) < dayKey()
                            ? 'red'
                            : undefined
                        }
                      >
                        {l.status === 'BORROWED' && l.dueDate.slice(0, 10) < dayKey()
                          ? 'OVERDUE'
                          : l.status}
                      </Badge>
                    </td>
                    <td>{bdt(l.fineMinor)}</td>
                    <td>
                      {staff && l.status === 'BORROWED' && (
                        <div className="inline-actions">
                          <Button
                            variant="ghost"
                            onClick={() => action(`library/loans/${l.id}/return`, { lost: false })}
                          >
                            Return book
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setModal({ type: 'lost', loan: l })}
                          >
                            Report lost
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loans?.length && <State empty />}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Learner</th>
                  <th>Reserved on</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reservations?.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.book.title}</strong>
                    </td>
                    <td>{r.student.fullName}</td>
                    <td>{displayDate(r.createdAt)}</td>
                    <td>
                      <Badge>{r.status}</Badge>
                    </td>
                    <td>
                      {r.status === 'WAITING' && (
                        <Button
                          variant="ghost"
                          onClick={() => action(`library/reservations/${r.id}/cancel`, {})}
                        >
                          Cancel reservation
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!reservations?.length && <State empty />}
          </div>
        )}
      </Panel>
      <div className="info-banner section-space">
        Overdue charges: ৳5 per calendar day, capped at ৳500. Lost books use the configured
        replacement value. Charges become fee invoices when the return is recorded.
      </div>
      {modal && (
        <FormModal
          title={
            modal.type === 'book'
              ? 'Catalog a book'
              : modal.type === 'issue'
                ? `Issue ${modal.book.title}`
                : modal.type === 'stock'
                  ? 'Update stock'
                  : modal.type === 'reserve'
                    ? `Reserve ${modal.book.title}`
                    : 'Report a lost copy'
          }
          fields={fields}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            if (modal.type === 'book') {
              const { replacement, ...rest } = v;
              await post('library/books', {
                ...rest,
                replacementMinor: Math.round(replacement * 100),
              });
            } else if (modal.type === 'issue')
              await post('library/loans', { ...v, bookId: modal.book.id });
            else if (modal.type === 'stock')
              await post(`library/books/${modal.book.id}`, v, 'PATCH');
            else if (modal.type === 'reserve')
              await post('library/reservations', { ...v, bookId: modal.book.id });
            else {
              if (v.confirmation !== 'LOST')
                throw new Error('Please type LOST to confirm the replacement charge');
              await post(`library/loans/${modal.loan.id}/return`, { lost: true });
            }
            await refresh();
            setToast('Library records updated');
          }}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
