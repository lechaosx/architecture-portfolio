{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }: {
    devShells = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        browsers = pkgs.playwright-driver.browsers.override { withWebkit = false; };
      in
      {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_24 browsers pkgs.util-linux ];
          PLAYWRIGHT_BROWSERS_PATH = browsers;
        };
      });
  };
}
