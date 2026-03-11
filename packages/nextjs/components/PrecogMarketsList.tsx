import { MarketListV7 } from "~~/components/MarketListV7";
import { MarketListV8 } from "~~/components/MarketListV8";
import type { MarketInfo, MarketInfoV8, PrecogMarketsResult } from "~~/hooks/usePrecogMarketData";
import type { PrecogMasterVersion } from "~~/utils/scaffold-eth/contractsData";

/**
 * Renders the correct list component for the given PrecogMaster version.
 * Adding a new version = add to PrecogMasterVersion and a branch here; page stays free of version literals.
 */
export function PrecogMarketsList({ version, data, searchFilter, statusFilter }: {
  version: PrecogMasterVersion;
  data: PrecogMarketsResult;
  searchFilter: string;
  statusFilter: string;
}) {
  switch (version) {
    case "v7": {
      const { markets } = data as { markets: MarketInfo[] };
      return <MarketListV7 markets={markets} searchFilter={searchFilter} statusFilter={statusFilter} />;
    }
    case "v8": {
      const { markets } = data as { markets: MarketInfoV8[] };
      return <MarketListV8 markets={markets} searchFilter={searchFilter} statusFilter={statusFilter} />;
    }
  }
}
