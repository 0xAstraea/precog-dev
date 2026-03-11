"use client";

import React, { useEffect, useState } from "react";
import type { NextPage } from "next";
import { PrecogMarketsList } from "~~/components/PrecogMarketsList";
import { usePrecogMarkets } from "~~/hooks/usePrecogMarketData";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getAvailablePrecogMasterVersions, getContractsByNetwork, getPrecogMasterContractKey, type PrecogMasterVersion } from "~~/utils/scaffold-eth/contractsData";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";
import { ArrowTopRightOnSquareIcon, XCircleIcon } from "@heroicons/react/24/outline";

// Colors for the status filter
const statusStyles: { [key: string]: string } = {
  all: "text-base-content",
  created: "text-warning",
  open: "text-success",
  closed: "text-error",
};

const Home: NextPage = () => {
  const [masterVersion, setMasterVersion] = useState<PrecogMasterVersion>("v8");
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { targetNetwork } = useTargetNetwork();

  const availableVersions = getAvailablePrecogMasterVersions(targetNetwork.id);
  const dropdownVersions = availableVersions.length > 0 ? availableVersions : (["v7"] as PrecogMasterVersion[]);

  useEffect(() => {
    const currentAvailable = getAvailablePrecogMasterVersions(targetNetwork.id);
    const currentDropdown = currentAvailable.length > 0 ? currentAvailable : (["v7"] as PrecogMasterVersion[]);
    const preferred = currentDropdown.includes("v8") ? "v8" : currentDropdown[0];
    setMasterVersion(preferred);
  }, [targetNetwork.id]);

  const handleSearchFilterChange = (value: string) => setSearchFilter(value);
  const handleStatusFilterChange = (value: string) => setStatusFilter(value);

  // Get all precog markets for selected network and version
  const { data, isLoading, error } = usePrecogMarkets(masterVersion);

  // Get precog master address and build external link to explorer
  const contractsData = getContractsByNetwork(targetNetwork.id);
  const masterContractKey = getPrecogMasterContractKey(masterVersion);
  const precogMasterAddress = contractsData[masterContractKey]?.address;
  const explorerLink = getBlockExplorerAddressLink(targetNetwork, precogMasterAddress);

  return (
    <>
      <div className="flex items-center flex-col flex-grow pt-2">
        <div className="w-full px-4 md:px-12 pt-5">
          <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-2xl font-bold m-0 font-mono">Prediction Markets</h2>
              <select
                className="select select-bordered select-sm font-mono font-bold"
                value={masterVersion}
                onChange={e => setMasterVersion(e.target.value as PrecogMasterVersion)}
              >
                {dropdownVersions.map(version => (
                  <option key={version} value={version}>
                    {version.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:justify-end">
              <div className="relative">
                <input
                  type="text"
                  value={searchFilter}
                  onChange={e => handleSearchFilterChange(e.target.value)}
                  placeholder="Search Market"
                  className="input input-bordered input-sm pr-8 min-w-60"
                />
                {searchFilter && (
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center"
                    onClick={() => handleSearchFilterChange("")}
                  >
                    <XCircleIcon className="h-5 w-5 text-base-content/60 hover:text-error" />
                  </button>
                )}
              </div>
              <select
                className={`select select-bordered select-sm font-bold uppercase text-xs ${statusStyles[statusFilter]}`}
                value={statusFilter}
                onChange={e => handleStatusFilterChange(e.target.value)}
              >
                <option value="all" className="text-base-content font-bold">
                  All
                </option>
                <option value="created" className="text-warning font-bold">
                  Created
                </option>
                <option value="open" className="text-success font-bold">
                  Open
                </option>
                <option value="closed" className="text-error font-bold">
                  Closed
                </option>
              </select>
            </div>
          </div>
          {isLoading && (
            <div className="flex flex-wrap justify-center py-40">
              <p className="font-mono text-2xl text-accent animate-pulse">-- LOADING MARKETS --</p>
            </div>
          )}
          {error && (
            <div className="flex flex-wrap justify-center py-40">
              <p className="font-mono text-2xl text-error">--! ERROR: COULD NOT LOAD MARKETS !--</p>
            </div>
          )}
          {data && (
            <PrecogMarketsList
              version={masterVersion}
              data={data}
              searchFilter={searchFilter}
              statusFilter={statusFilter}
            />
          )}
          <div className="flex justify-center items-center mt-8">
            <div className="font-mono text-center text-base flex flex-col sm:flex-row">
              <span className="font-bold text-base-content/70 mr-2">:: PrecogMaster{masterVersion.toUpperCase()} ::</span>
              <a
                href={explorerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:underline text-accent flex-col sm:flex-row break-all font-mono"
              >
                {precogMasterAddress}
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
