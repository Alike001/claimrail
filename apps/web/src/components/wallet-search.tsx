"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function WalletSearch({ initialAddress = "" }: { readonly initialAddress?: string }) {
  const [address, setAddress] = useState(initialAddress);
  const [error, setError] = useState("");
  const router = useRouter();
  function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      setError("Enter a valid 0x wallet address.");
      return;
    }
    setError("");
    router.push(`/wallet/${address.trim()}`);
  }
  return (
    <form className="wallet-form" onSubmit={inspect} noValidate>
      <label htmlFor="wallet-address">wallet monitor</label>
      <div className="wallet-control">
        <input
          id="wallet-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x… public address"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit">inspect</button>
      </div>
      <p className="field-error" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
