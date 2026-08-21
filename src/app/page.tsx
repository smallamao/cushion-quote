import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { QuoteEditor } from "@/components/quote-editor/QuoteEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function HomePage() {
  return (
    <>
    <Tabs defaultValue="editor">
      <TabsList>
        <TabsTrigger value="editor">報價編輯</TabsTrigger>
        <TabsTrigger value="dashboard">營運統計</TabsTrigger>
      </TabsList>
      <TabsContent value="editor">
        <QuoteEditor />
      </TabsContent>
      <TabsContent value="dashboard">
        <DashboardPanel />
      </TabsContent>
    </Tabs>
    </>
  );
}
