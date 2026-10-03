import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileArchive, LoaderCircle, Upload } from "lucide-react";
import {
  getListBotsQueryKey,
  useCompleteBotPackageUpload,
  useRequestBotPackageUpload,
  type Bot,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const maxSize = 25 * 1024 * 1024;

export function BotPackageUpload({ bot }: { bot: Bot }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const requestUpload = useRequestBotPackageUpload();
  const completeUpload = useCompleteBotPackageUpload();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function uploadPackage(file: File) {
    const name = file.name.replaceAll("\\", "/").split("/").pop() || "bot.zip";
    if (!name.toLowerCase().endsWith(".zip")) {
      setError("اختر ملف مشروع مضغوطاً بصيغة ZIP.");
      return;
    }
    if (file.size < 1 || file.size > maxSize) {
      setError("يجب أن يكون حجم الملف أقل من 25 ميغابايت.");
      return;
    }

    setIsUploading(true);
    setError("");
    setSuccess("");
    try {
      const contentType = file.type || "application/zip";
      const ticket = await requestUpload.mutateAsync({
        botId: bot.id,
        data: { name, size: file.size, contentType },
      });
      const uploadResponse = await fetch(ticket.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("storage-upload-failed");
      }
      await completeUpload.mutateAsync({
        botId: bot.id,
        data: { objectPath: ticket.objectPath },
      });
      await client.invalidateQueries({ queryKey: getListBotsQueryKey() });
      setSuccess("تم حفظ الملف في مساحة تخزين خاصة. لم يتم تشغيل محتواه.");
    } catch {
      setError("تعذر رفع الملف. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section className="section-card package-card" data-testid="card-bot-package">
      <div className="package-heading">
        <div className="package-icon"><FileArchive size={18} /></div>
        <div>
          <span className="section-overline">حزمة المشروع</span>
          <h2>ارفع ملفات البوت</h2>
        </div>
        <span className="package-private"><span /> تخزين خاص</span>
      </div>
      <p className="package-description">
        ارفع ملف ZIP للمشروع بحد أقصى 25 ميغابايت. يحفظه زِد بصورة خاصة؛ لا يشغّل
        هذه النسخة كوداً مرفوعاً من الأعضاء.
      </p>
      <input
        ref={fileInput}
        className="package-file-input"
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        aria-label="اختيار ملف ZIP للبوت"
        data-testid="input-bot-package"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadPackage(file);
        }}
      />
      <div className="package-controls">
        <Button
          type="button"
          variant="outline"
          className="package-select-button"
          disabled={isUploading}
          onClick={() => fileInput.current?.click()}
          data-testid="button-select-bot-package"
        >
          {isUploading ? (
            <LoaderCircle className="animate-spin" size={15} />
          ) : (
            <Upload size={15} />
          )}
          {isUploading ? "جارٍ الرفع..." : "اختيار ملف ZIP"}
        </Button>
        <span className="package-limit">ZIP فقط · حتى 25 MB</span>
      </div>
      {bot.packageName && (
        <div className="package-current" data-testid="status-bot-package">
          <FileArchive size={16} />
          <div>
            <b>{bot.packageName}</b>
            <span>
              {bot.packageSize
                ? `${(bot.packageSize / (1024 * 1024)).toFixed(2)} MB`
                : "حزمة محفوظة"}
              {bot.packageUploadedAt
                ? ` · ${new Intl.DateTimeFormat("ar", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(bot.packageUploadedAt))}`
                : ""}
            </span>
          </div>
          <span className="package-saved">محفوظ</span>
        </div>
      )}
      {success && <p className="package-feedback success" role="status">{success}</p>}
      {error && <p className="package-feedback error" role="alert">{error}</p>}
      <p className="package-safety">
        <strong>التشغيل الفعلي غير مفعّل.</strong> يحتاج إلى عامل معزول قبل السماح
        بتنفيذ ملفات المستخدمين.
      </p>
    </section>
  );
}