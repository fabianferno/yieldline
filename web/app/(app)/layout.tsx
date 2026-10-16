import { Sidebar } from "@/components/Sidebar";
import { TourProvider } from "@/components/Tour";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TourProvider>
      <div className="mx-auto grid max-w-[1536px] grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-[272px_1fr] lg:gap-5">
        <Sidebar />
        <main className="min-w-0">{children}</main>
      </div>
    </TourProvider>
  );
}
