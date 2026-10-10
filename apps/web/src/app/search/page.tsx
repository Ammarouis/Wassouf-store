import type { Metadata } from 'next'; import { getProducts, getBrands, getBranches } from '@/lib/api'; import { ProductCard } from '@/components/ProductCard'; import { Search as SearchIcon, ChevronDown, Grid2X2, MapPin } from 'lucide-react';
export const metadata:Metadata={title:'البحث عن الهواتف'};
export default async function SearchPage({searchParams}:{searchParams:Promise<{q?:string;brand?:string;branch?:string}>}){
  const params=await searchParams;
  const q=params.q||'';
  const brand=params.brand||'';
  const branch=params.branch||'';
  const [result,brands,branches]=await Promise.all([getProducts({q,brand,branch,pageSize:48}),getBrands(),getBranches()]);
  return (
    <div className="page-shell inner-page">
      <div className="page-title">
        <span className="section-eyebrow">كتالوج الأجهزة</span>
        <h1>ابحث عن هاتفك</h1>
        <p>ابحث بالاسم أو الماركة أو الموديل، ثم تحقق من توفر الجهاز في الفروع.</p>
      </div>
      <form action="/search" className="search-panel">
        <div className="search-field">
          <div className="search-input-wrap">
            <SearchIcon size={20} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="مثال: iPhone 15 أو سامسونج..." aria-label="ابحث عن هاتف"/>
          </div>
          <button className="search-submit" type="submit"><SearchIcon size={17} aria-hidden="true" /><span>بحث</span></button>
        </div>
        <div className="search-filters">
          <label className="search-select">
            <span className="search-select-label"><Grid2X2 size={15} aria-hidden="true" /> الماركة</span>
            <span className="search-select-control">
              <select name="brand" defaultValue={brand} aria-label="تصفية حسب الماركة"><option value="">كل الماركات</option>{brands.map(b=><option key={b.name} value={b.name}>{b.name}</option>)}</select>
              <ChevronDown className="search-caret" size={16} aria-hidden="true" />
            </span>
          </label>
          <label className="search-select">
            <span className="search-select-label"><MapPin size={15} aria-hidden="true" /> الفرع</span>
            <span className="search-select-control">
              <select name="branch" defaultValue={branch} aria-label="تصفية حسب الفرع"><option value="">كل الفروع</option>{branches.map(b=><option key={b.branchCode} value={b.branchCode}>{b.name}</option>)}</select>
              <ChevronDown className="search-caret" size={16} aria-hidden="true" />
            </span>
          </label>
        </div>
      </form>
      <div className="results-heading"><div><h2>{q?`نتائج البحث عن «${q}»`:brand?`أجهزة ${brand}`:'جميع الأجهزة'}</h2><p>{result.total} نتيجة</p></div></div>
      {result.items.length?<div className="product-grid">{result.items.map(p=><ProductCard key={p.productCode} product={p}/>)}</div>:<div className="empty-state"><span>⌕</span><h3>لم نعثر على أجهزة مطابقة</h3><p>جرّب كتابة اسم مختلف أو إزالة أحد الفلاتر.</p><a href="/search" className="button button-primary">عرض كل الأجهزة</a></div>}
    </div>
  );
}
