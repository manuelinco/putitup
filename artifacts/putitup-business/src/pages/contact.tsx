import { Link } from "wouter";
import { ContactForm } from "@/components/contact-form";
import { Zap, MessageSquare } from "lucide-react";

export default function Contact() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight">
          PUTITUP<span className="text-primary"> Business</span>
        </span>
      </Link>

      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <MessageSquare className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Contattaci</h1>
          <p className="mt-2 text-muted-foreground">
            Hai una domanda, ti serve un dataset su misura o vuoi saperne di più sui nostri piani?
            Ti rispondiamo entro 24 ore.
          </p>
        </div>

        <ContactForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Puoi anche scriverci a{" "}
          <a href="mailto:info@putitupbusiness.it" className="text-primary hover:underline font-medium">
            info@putitupbusiness.it
          </a>
        </p>
      </div>
    </div>
  );
}
