'use client';
import { useState } from 'react';
import { Clock, LifeBuoy, MessageSquare, Plus, Send } from 'lucide-react';
import { ModuleGate } from '@/components/module-gate';
import { useCampus } from '@/components/shell';
import {
  Badge,
  Button,
  FormModal,
  Modal,
  PageTitle,
  Panel,
  SearchBox,
  State,
  Toast,
} from '@/components/ui';
import { useData } from '@/lib/use-data';
import { displayDate, post } from '@/lib/api';
export default function Support() {
  return (
    <ModuleGate feature="support">
      <SupportContent />
    </ModuleGate>
  );
}
function SupportContent() {
  const { can } = useCampus(),
    staff = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL');
  const { data, error, loading, reload } = useData('support/tickets');
  const { data: agents } = useData(staff ? 'support/agents' : null);
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [modal, setModal] = useState<any>(null),
    [ticketId, setTicket] = useState(''),
    [reply, setReply] = useState(''),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState('');
  const ticket = data?.find((t: any) => t.id === ticketId),
    filtered =
      data?.filter(
        (t: any) =>
          (!status || t.status === status) &&
          `${t.title} ${t.category}`.toLowerCase().includes(search.toLowerCase()),
      ) || [];
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`support/tickets/${ticket.id}/comments`, { body: reply });
      setReply('');
      await reload();
      setToast('Reply added to the request');
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="A little help goes a long way."
        eyebrow="REQUESTS & SUPPORT"
        description="The right conversation, with a clear owner, priority and history."
      >
        <Button onClick={() => setModal({ type: 'new' })}>
          <Plus size={16} />
          Open a request
        </Button>
      </PageTitle>
      <div className="stats-grid">
        {[
          ['Open', data?.filter((t: any) => t.status === 'OPEN').length || 0],
          ['In progress', data?.filter((t: any) => t.status === 'IN_PROGRESS').length || 0],
          ['Resolved', data?.filter((t: any) => t.status === 'RESOLVED').length || 0],
          [
            'Past response target',
            data?.filter(
              (t: any) =>
                !['RESOLVED', 'CLOSED'].includes(t.status) && new Date(t.slaDueAt) < new Date(),
            ).length || 0,
          ],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>Accessible campus requests</p>
          </div>
        ))}
      </div>
      <Panel>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search requests…" />
          <select
            aria-label="Request status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All requests</option>
            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {loading || error || !filtered.length ? (
          <State loading={loading} error={error} empty={!filtered.length} onRetry={reload} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Opened by</th>
                  <th>Priority</th>
                  <th>Response target</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t: any) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.title}</strong>
                      <div>{t.category.toLowerCase()}</div>
                    </td>
                    <td>{t.createdBy.fullName}</td>
                    <td>
                      <Badge
                        tone={
                          t.priority === 'URGENT' ? 'red' : t.priority === 'HIGH' ? 'amber' : 'blue'
                        }
                      >
                        {t.priority}
                      </Badge>
                    </td>
                    <td>
                      {displayDate(t.slaDueAt)}
                      <div>
                        {new Date(t.slaDueAt).toLocaleTimeString('en-GB', {
                          timeZone: 'Asia/Dhaka',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        Dhaka
                      </div>
                    </td>
                    <td>
                      <Badge>{t.status}</Badge>
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => setTicket(t.id)}>
                        Open conversation
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {ticket && (
        <Modal title={ticket.title} onClose={() => setTicket('')}>
          <div className="ticket-dialog">
            <div className="inline-actions">
              <Badge>{ticket.status}</Badge>
              <Badge>{ticket.priority}</Badge>
              <Button
                variant="ghost"
                onClick={() => {
                  setTicket('');
                  setModal({ type: 'status', ticket });
                }}
              >
                Update status
              </Button>
            </div>
            <p>
              Response target:{' '}
              {new Date(ticket.slaDueAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}
            </p>
            <div className="ticket-thread">
              {ticket.comments.map((c: any) => (
                <div className="ticket-comment" key={c.id}>
                  <div>
                    <strong>{c.author.fullName}</strong>
                    <time>{displayDate(c.createdAt)}</time>
                  </div>
                  <p className="notice-body">{c.body}</p>
                </div>
              ))}
            </div>
            {ticket.status !== 'CLOSED' && (
              <form className="form-grid" onSubmit={send}>
                <label>
                  Your reply
                  <textarea
                    minLength={2}
                    maxLength={5000}
                    required
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                </label>
                <Button busy={busy}>
                  <Send size={16} />
                  Send reply
                </Button>
              </form>
            )}
          </div>
        </Modal>
      )}
      {modal && (
        <FormModal
          title={modal.type === 'new' ? 'Let’s get this sorted.' : 'Update request status'}
          fields={
            modal.type === 'new'
              ? [
                  { key: 'title', label: 'What do you need help with?' },
                  {
                    key: 'category',
                    label: 'Category',
                    options: ['ACADEMIC', 'FINANCE', 'TRANSPORT', 'TECHNICAL', 'OTHER'].map(
                      (v) => ({ value: v, label: v }),
                    ),
                  },
                  {
                    key: 'priority',
                    label: 'Priority',
                    options: [
                      { value: 'NORMAL', label: 'Normal · 72-hour response target' },
                      { value: 'HIGH', label: 'High · 24-hour response target' },
                      { value: 'URGENT', label: 'Urgent · 4-hour response target' },
                    ],
                  },
                  { key: 'body', label: 'Tell us a little more', type: 'textarea' },
                ]
              : [
                  {
                    key: 'status',
                    label: 'Request status',
                    options: (staff
                      ? ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
                      : ['OPEN', 'CLOSED']
                    ).map((v) => ({ value: v, label: v.replaceAll('_', ' ') })),
                    defaultValue: modal.ticket.status,
                  },
                  ...(staff
                    ? [
                        {
                          key: 'assignedToId',
                          label: 'Assigned staff member',
                          required: false,
                          options:
                            agents?.map((a: any) => ({ value: a.id, label: a.fullName })) || [],
                          defaultValue: modal.ticket.assignedToId || '',
                        },
                      ]
                    : []),
                ]
          }
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            await post(
              modal.type === 'new' ? 'support/tickets' : `support/tickets/${modal.ticket.id}`,
              v,
              modal.type === 'new' ? 'POST' : 'PATCH',
            );
            await reload();
            setToast('Request updated');
          }}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
