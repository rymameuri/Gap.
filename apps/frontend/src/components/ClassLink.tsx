import {
  Link as RouterLink,
  useLocation,
  type LinkProps,
} from "react-router-dom";
export function ClassLink(props: LinkProps) {
  const { search } = useLocation();
  let to = props.to;
  if (typeof to === "string") {
    const [path, query = ""] = to.split("?");
    const params = new URLSearchParams(query);
    const classId = new URLSearchParams(search).get("classId");
    if (classId && !params.has("classId")) params.set("classId", classId);
    to = path + (params.size ? "?" + params.toString() : "");
  }
  return <RouterLink {...props} to={to} />;
}
