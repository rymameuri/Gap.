import {
  Link as RouterLink,
  useLocation,
  type LinkProps,
} from "react-router-dom";
export function ClassLink(props: LinkProps) {
  const { search } = useLocation();
  const to =
    typeof props.to === "string" && !props.to.includes("?")
      ? props.to + search
      : props.to;
  return <RouterLink {...props} to={to} />;
}
