'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { BRAND_CATALOG, findBrand, type CatalogBrand } from '@/lib/brandCatalog';
import { BrandIcon } from './BrandIcon';

interface BrandPickerProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  id?: string;
}

/** Builds a readable tile for a brand we have no catalogue entry for. */
function looseBrand(value: string): CatalogBrand {
  return { name: value, ar: '', color: '#5A7EAF', onColor: '#ffffff', mono: value.trim().slice(0, 2).toUpperCase() };
}

export function BrandPicker({ value, onChange, required, placeholder = 'اختر الماركة', id }: BrandPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => (value ? findBrand(value) || looseBrand(value) : undefined), [value]);

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    // Keep a brand that is already saved but missing from the catalogue.
    const known = new Set(BRAND_CATALOG.map((brand) => brand.name));
    const extras = value && !known.has(value) ? [findBrand(value) || looseBrand(value)] : [];
    const all = [...extras, ...BRAND_CATALOG];
    if (!term) return all;
    return all.filter((brand) => brand.name.toLowerCase().includes(term) || brand.ar.includes(term));
  }, [query, value]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const focus = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.clearTimeout(focus);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (brand: CatalogBrand) => {
    onChange(brand.name);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const brand = options[active];
      if (brand) choose(brand);
    } else if (event.key === 'Home') {
      setActive(0);
    } else if (event.key === 'End') {
      setActive(Math.max(options.length - 1, 0));
    }
  };

  return (
    <div className="brand-picker" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        className={`brand-picker-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
      >
        {selected ? (
          <>
            <BrandIcon brand={selected} size={22} />
            <span className="brand-picker-name">{selected.name}</span>
            {selected.ar && <span className="brand-picker-ar">{selected.ar}</span>}
          </>
        ) : (
          <span className="brand-picker-placeholder">{placeholder}</span>
        )}
        <ChevronDown className="brand-picker-caret" size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className="brand-picker-menu">
          <div className="brand-picker-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              placeholder="ابحث عن ماركة..."
              aria-label="ابحث عن ماركة"
              autoComplete="off"
            />
          </div>
          <ul className="brand-picker-list" role="listbox" ref={listRef} aria-label="الماركات">
            {options.length === 0 && <li className="brand-picker-empty">لا توجد نتائج مطابقة</li>}
            {options.map((brand, index) => (
              <li key={brand.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={brand.name === value}
                  data-active={index === active}
                  className={`brand-picker-option${index === active ? ' active' : ''}${brand.name === value ? ' selected' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(brand)}
                >
                  <BrandIcon brand={brand} size={24} />
                  <span className="brand-picker-option-text">
                    <b>{brand.name}</b>
                    {brand.ar && <small>{brand.ar}</small>}
                  </span>
                  {brand.name === value && <Check className="brand-picker-check" size={15} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}