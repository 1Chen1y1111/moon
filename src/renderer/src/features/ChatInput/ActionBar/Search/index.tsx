import { Globe } from 'lucide-react'

import Action from '../components/Action'

export default function Search(): React.JSX.Element {
  return <Action disabled icon={Globe} title="联网搜索" />
}
