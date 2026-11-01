import { Fragment, useEffect, useState } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api, type LogEntry } from './api.ts';
import { money, strategies } from './labels.ts';
import { Admin } from './Admin.tsx';
import { Explanation, Pos } from './Pos.tsx';

export function App() {
  return (
    <TooltipProvider>
      <Tabs defaultValue="pos" className="min-h-screen gap-0 bg-muted/40">
        <header className="sticky top-0 z-10 border-b bg-background">
          <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-2.5">
            <span className="text-lg font-semibold tracking-tight">PromoStack</span>
            <TabsList>
              <TabsTrigger value="pos">Каса</TabsTrigger>
              <TabsTrigger value="admin">Акції</TabsTrigger>
              <TabsTrigger value="audit">Журнал</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" className="ml-auto" asChild>
              <a href="/docs" target="_blank" rel="noreferrer">
                API <ExternalLinkIcon />
              </a>
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] p-5">
          {/* inactive tabs unmount, so every screen loads fresh data when opened */}
          <TabsContent value="pos">
            <Pos />
          </TabsContent>
          <TabsContent value="admin">
            <Admin />
          </TabsContent>
          <TabsContent value="audit">
            <Audit />
          </TabsContent>
        </main>
      </Tabs>
    </TooltipProvider>
  );
}

function Audit() {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => void api.calculations(100).then(setRows), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Журнал розрахунків</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Час</TableHead>
              <TableHead>Канал</TableHead>
              <TableHead>Алгоритм</TableHead>
              <TableHead className="text-right">Сума</TableHead>
              <TableHead className="text-right">Знижка</TableHead>
              <TableHead className="text-right">До сплати</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <TableRow className="cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <TableCell>{r.id}</TableCell>
                  <TableCell>{new Date(r.at).toLocaleString('uk-UA')}</TableCell>
                  <TableCell>{r.channel ?? '-'}</TableCell>
                  <TableCell>{strategies[r.strategy]}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.subtotal)}</TableCell>
                  <TableCell className="text-right text-emerald-700 tabular-nums">−{money(r.discount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.total)}</TableCell>
                </TableRow>
                {open === r.id && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="whitespace-normal">
                      <Explanation result={r.result} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
