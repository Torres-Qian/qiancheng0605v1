import type { Metadata } from "next";
import "./globals.css";
import { AppLayout } from "@/components/layout/AppLayout";
import { ToastContainer } from "@/components/shared/Toast";
import { ConfirmDialogProvider } from "@/components/shared/ConfirmDialog";

export const metadata: Metadata = {
  title: "万能导入 - 智能多格式批量下单系统",
  description: "基于AI大模型的智能多格式文件解析与批量下单系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full">
        <ConfirmDialogProvider>
          <AppLayout>{children}</AppLayout>
          <ToastContainer />
        </ConfirmDialogProvider>
      </body>
    </html>
  );
}
