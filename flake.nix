{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
    in
    {
      devShells.x86_64-linux.default = pkgs.mkShell {
        packages = [ pkgs.nodejs_24 pkgs.playwright-driver.browsers pkgs.util-linux ];
        PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
      };
    };
}
