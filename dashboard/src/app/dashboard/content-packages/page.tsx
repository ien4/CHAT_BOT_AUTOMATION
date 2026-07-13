'use client';

import { TenantScopeBanner } from '@/components/TenantScopeBanner';
import {
  ContentPackageDetails,
  ContentPackageFormModal,
  ContentPackageItemFormModal,
  ContentPackagesErrorBanner,
  ContentPackagesHeader,
  ContentPackagesList,
  ContentPackagesLoadingState,
  useContentPackages,
} from '@/features/content-packages';

export default function ContentPackagesPage() {
  const contentPackages = useContentPackages();

  if (contentPackages.loading) {
    return <ContentPackagesLoadingState />;
  }

  return (
    <div>
      <TenantScopeBanner />
      <ContentPackagesHeader
        isPlatformAdmin={contentPackages.isPlatformAdmin}
        migrating={contentPackages.migrating}
        onMigrate={contentPackages.migrate}
        onCreatePackage={contentPackages.openNewPkg}
      />

      {contentPackages.error && (
        <ContentPackagesErrorBanner error={contentPackages.error} onDismiss={() => contentPackages.setError(null)} />
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-5">
          <ContentPackagesList
            packages={contentPackages.packages}
            globalPackages={contentPackages.globalPackages}
            tenantPackages={contentPackages.tenantPackages}
            selectedPackageId={contentPackages.selectedPkg?.id}
            canEditPackage={contentPackages.canEditPackage}
            onSelectPackage={contentPackages.selectPackage}
            onEditPackage={contentPackages.openEditPkg}
            onDeletePackage={contentPackages.deletePkg}
          />
        </div>

        <div className="col-span-7">
          <ContentPackageDetails
            selectedPkg={contentPackages.selectedPkg}
            items={contentPackages.items}
            canEditSelectedPkg={contentPackages.canEditSelectedPkg}
            onNewItem={contentPackages.openNewItem}
            onEditItem={contentPackages.openEditItem}
            onDeleteItem={contentPackages.deleteItem}
          />
        </div>
      </div>

      {contentPackages.showPkgForm && (
        <ContentPackageFormModal
          editPackageId={contentPackages.editPkg?.id}
          canCreateGlobal={contentPackages.canCreateGlobal}
          selectedTenantId={contentPackages.selectedTenantId}
          pkgForm={contentPackages.pkgForm}
          setPkgForm={contentPackages.setPkgForm}
          onClose={() => contentPackages.setShowPkgForm(false)}
          onSave={contentPackages.savePkg}
        />
      )}

      {contentPackages.showItemForm && (
        <ContentPackageItemFormModal
          editItemId={contentPackages.editItem?.id}
          itemForm={contentPackages.itemForm}
          setItemForm={contentPackages.setItemForm}
          onClose={() => contentPackages.setShowItemForm(false)}
          onSave={contentPackages.saveItem}
        />
      )}
    </div>
  );
}
