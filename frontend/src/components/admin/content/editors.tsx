"use client";

import { Lock } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import {
  itemsRangeAt,
  legalFaqSlot,
  maxLengthAt,
  moveItem,
  removeItem,
  replaceItem,
  type FieldErrors,
} from "@/lib/content-form";
import {
  LEGAL_FAQ_ITEM,
  PARTNER_BRANDS_TOKEN,
  type ContactContent,
  type ContentKey,
  type ContentValue,
  type FaqContent,
  type FaqItem,
  type HeroContent,
  type SeoContent,
  type TrustBandContent,
} from "@/lib/content/schemas";
import { FieldGroup } from "../form";
import { AddButton, CountedField, ItemControls, StringListField } from "./fields";

/**
 * Un editor por clave (A5.4). No se genera el formulario a ciegas desde el
 * esquema: cada clave tiene su forma (tres tarjetas fijas, preguntas con la
 * legal bloqueada en medio), pero los máximos y las longitudes de lista sí
 * salen del esquema (`maxLengthAt`, `itemsRangeAt`).
 */

interface EditorProps<T> {
  value: T;
  errors: FieldErrors;
  /** El operator ve el contenido pero no puede publicar: los campos van en solo lectura. */
  readOnly: boolean;
  onChange: (value: T) => void;
}

function HeroEditor({ value, errors, readOnly, onChange }: EditorProps<HeroContent>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CountedField
        id="hero-label"
        label="Etiqueta"
        hint="Sin corchetes: los pone el sitio."
        value={value.label}
        max={maxLengthAt("hero", ["label"])}
        error={errors.label}
        readOnly={readOnly}
        onChange={(label) => onChange({ ...value, label })}
      />
      <CountedField
        id="hero-tagline"
        label="Reclamo"
        hint="Debajo del logotipo, en mayúsculas pixel."
        value={value.tagline}
        max={maxLengthAt("hero", ["tagline"])}
        error={errors.tagline}
        readOnly={readOnly}
        onChange={(tagline) => onChange({ ...value, tagline })}
      />
    </div>
  );
}

function TrustBandEditor({ value, errors, readOnly, onChange }: EditorProps<TrustBandContent>) {
  type Card = TrustBandContent["items"][number];
  const set = (index: number, card: Card) => onChange({ items: replaceItem(value.items, index, card) });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Son exactamente tres: el panel está maquetado para tres tarjetas apiladas en un teléfono.
      </p>
      {value.items.map((card, index) => (
        <FieldGroup key={index} title={`Tarjeta ${index + 1}`}>
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_2fr]">
            <CountedField
              id={`trust-${index}-label`}
              label="Etiqueta"
              value={card.label}
              max={maxLengthAt("trust-band", ["items", index, "label"])}
              error={errors[`items.${index}.label`]}
              readOnly={readOnly}
              onChange={(label) => set(index, { ...card, label })}
            />
            <CountedField
              id={`trust-${index}-title`}
              label="Título"
              value={card.title}
              max={maxLengthAt("trust-band", ["items", index, "title"])}
              error={errors[`items.${index}.title`]}
              readOnly={readOnly}
              onChange={(title) => set(index, { ...card, title })}
            />
            <CountedField
              id={`trust-${index}-detail`}
              label="Detalle"
              className="sm:col-span-2"
              value={card.detail}
              max={maxLengthAt("trust-band", ["items", index, "detail"])}
              error={errors[`items.${index}.detail`]}
              readOnly={readOnly}
              onChange={(detail) => set(index, { ...card, detail })}
            />
          </div>
        </FieldGroup>
      ))}
    </div>
  );
}

/** La pregunta legal +18, bloqueada en el mismo hueco donde la pinta el sitio. */
function LegalFaqCard() {
  return (
    <li>
      <Surface border="accent" className="space-y-2 p-4">
        <p className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.04em]">
          <Lock className="size-4" aria-hidden="true" />
          Pregunta legal fija · no editable
        </p>
        <p className="font-display font-bold">{LEGAL_FAQ_ITEM.question}</p>
        <p className="text-sm text-muted">{LEGAL_FAQ_ITEM.answer}</p>
        <p className="text-xs text-muted">
          Es el aviso de mayoría de edad (Ley 1335 de 2009). Vive en el código y el sitio la muestra
          siempre en esta posición; cambiarla exige una revisión de código, no la consola.
        </p>
      </Surface>
    </li>
  );
}

function FaqEditor({ value, errors, readOnly, onChange }: EditorProps<FaqContent>) {
  const range = itemsRangeAt("faq", ["items"]);
  const setItems = (items: FaqItem[]) => onChange({ ...value, items });
  const slot = legalFaqSlot(value.items.length);

  const question = (item: FaqItem, index: number) => (
    <li key={index}>
      <Surface border="muted" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-xs font-bold uppercase tracking-[0.04em] text-muted">
            Pregunta {index + 1}
          </p>
          <ItemControls
            index={index}
            count={value.items.length}
            min={range.min}
            noun={`pregunta ${index + 1}`}
            readOnly={readOnly}
            onMove={(delta) => setItems(moveItem(value.items, index, delta))}
            onRemove={() => setItems(removeItem(value.items, index))}
          />
        </div>
        <CountedField
          id={`faq-${index}-question`}
          label="Pregunta"
          value={item.question}
          max={maxLengthAt("faq", ["items", index, "question"])}
          error={errors[`items.${index}.question`]}
          readOnly={readOnly}
          onChange={(text) => setItems(replaceItem(value.items, index, { ...item, question: text }))}
        />
        <CountedField
          id={`faq-${index}-answer`}
          label="Respuesta"
          multiline
          rows={4}
          value={item.answer}
          max={maxLengthAt("faq", ["items", index, "answer"])}
          error={errors[`items.${index}.answer`]}
          readOnly={readOnly}
          onChange={(text) => setItems(replaceItem(value.items, index, { ...item, answer: text }))}
        />
      </Surface>
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <CountedField
          id="faq-title"
          label="Título"
          value={value.title}
          max={maxLengthAt("faq", ["title"])}
          error={errors.title}
          readOnly={readOnly}
          onChange={(title) => onChange({ ...value, title })}
        />
        <CountedField
          id="faq-intro"
          label="Entradilla"
          multiline
          value={value.intro}
          max={maxLengthAt("faq", ["intro"])}
          error={errors.intro}
          readOnly={readOnly}
          onChange={(intro) => onChange({ ...value, intro })}
        />
      </div>

      <FieldGroup title="Preguntas">
        <p className="mt-2 text-sm text-muted">
          Escribe <code className="text-foreground">{PARTNER_BRANDS_TOKEN}</code> donde deban ir las marcas
          aliadas activas: el sitio lo sustituye por sus nombres. Entre {range.min} y {range.max} preguntas
          editables, más la legal.
        </p>
        {errors.items && <p className="mt-2 text-xs text-action">{errors.items}</p>}
        <ol className="mt-4 space-y-4">
          {value.items.slice(0, slot).map((item, index) => question(item, index))}
          <LegalFaqCard />
          {value.items.slice(slot).map((item, offset) => question(item, slot + offset))}
        </ol>
        <div className="mt-4">
          <AddButton
            label="Añadir pregunta"
            count={value.items.length}
            max={range.max}
            readOnly={readOnly}
            onAdd={() => setItems([...value.items, { question: "", answer: "" }])}
          />
        </div>
      </FieldGroup>
    </div>
  );
}

function SeoEditor({ value, errors, readOnly, onChange }: EditorProps<SeoContent>) {
  const card = (network: "openGraph" | "twitter", title: string) => (
    <FieldGroup title={title}>
      <div className="mt-3 grid gap-4">
        <CountedField
          id={`seo-${network}-title`}
          label="Título"
          value={value[network].title}
          max={maxLengthAt("seo", [network, "title"])}
          error={errors[`${network}.title`]}
          readOnly={readOnly}
          onChange={(text) => onChange({ ...value, [network]: { ...value[network], title: text } })}
        />
        <CountedField
          id={`seo-${network}-description`}
          label="Descripción"
          multiline
          value={value[network].description}
          max={maxLengthAt("seo", [network, "description"])}
          error={errors[`${network}.description`]}
          readOnly={readOnly}
          onChange={(text) => onChange({ ...value, [network]: { ...value[network], description: text } })}
        />
      </div>
    </FieldGroup>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Esto es lo que ven Google, WhatsApp y X. Un cambio aquí afecta al posicionamiento: cámbialo con calma.
      </p>
      <div className="grid gap-4">
        <CountedField
          id="seo-title"
          label="Título de la página"
          value={value.title}
          max={maxLengthAt("seo", ["title"])}
          error={errors.title}
          readOnly={readOnly}
          onChange={(title) => onChange({ ...value, title })}
        />
        <CountedField
          id="seo-description"
          label="Descripción"
          multiline
          value={value.description}
          max={maxLengthAt("seo", ["description"])}
          error={errors.description}
          readOnly={readOnly}
          onChange={(description) => onChange({ ...value, description })}
        />
      </div>
      <StringListField
        id="seo-keyword"
        label="Palabras clave"
        noun="Palabra clave"
        path="keywords"
        values={value.keywords}
        range={itemsRangeAt("seo", ["keywords"])}
        maxLength={maxLengthAt("seo", ["keywords", 0])}
        errors={errors}
        readOnly={readOnly}
        onChange={(keywords) => onChange({ ...value, keywords })}
      />
      {card("openGraph", "Tarjeta para WhatsApp y Facebook")}
      {card("twitter", "Tarjeta para X")}
    </div>
  );
}

function ContactEditor({ value, errors, readOnly, onChange }: EditorProps<ContactContent>) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        El teléfono y el WhatsApp no se editan aquí: vienen de la configuración del despliegue, para que
        nadie pueda desviar los pedidos cambiando un número desde la consola.
      </p>
      <div className="grid gap-4">
        <CountedField
          id="contact-about"
          label="Sobre la tienda"
          multiline
          value={value.about}
          max={maxLengthAt("contact", ["about"])}
          error={errors.about}
          readOnly={readOnly}
          onChange={(about) => onChange({ ...value, about })}
        />
        <CountedField
          id="contact-location"
          label="Ubicación"
          value={value.location}
          max={maxLengthAt("contact", ["location"])}
          error={errors.location}
          readOnly={readOnly}
          onChange={(location) => onChange({ ...value, location })}
        />
      </div>
      <StringListField
        id="contact-hours"
        label="Horario"
        noun="Horario"
        path="hours"
        values={value.hours}
        range={itemsRangeAt("contact", ["hours"])}
        maxLength={maxLengthAt("contact", ["hours", 0])}
        errors={errors}
        readOnly={readOnly}
        onChange={(hours) => onChange({ ...value, hours })}
      />
      <StringListField
        id="contact-service"
        label="Atención al cliente"
        noun="Línea"
        path="service"
        values={value.service}
        range={itemsRangeAt("contact", ["service"])}
        maxLength={maxLengthAt("contact", ["service", 0])}
        errors={errors}
        readOnly={readOnly}
        onChange={(service) => onChange({ ...value, service })}
      />
    </div>
  );
}

/** El editor de la clave elegida. */
export function ContentEditor<K extends ContentKey>({
  contentKey,
  ...props
}: EditorProps<ContentValue<K>> & { contentKey: K }) {
  // Cada rama recibe el valor de su clave: el `as` solo deshace el genérico.
  switch (contentKey) {
    case "hero":
      return <HeroEditor {...(props as unknown as EditorProps<HeroContent>)} />;
    case "trust-band":
      return <TrustBandEditor {...(props as unknown as EditorProps<TrustBandContent>)} />;
    case "faq":
      return <FaqEditor {...(props as unknown as EditorProps<FaqContent>)} />;
    case "seo":
      return <SeoEditor {...(props as unknown as EditorProps<SeoContent>)} />;
    case "contact":
      return <ContactEditor {...(props as unknown as EditorProps<ContactContent>)} />;
    default:
      return null;
  }
}
