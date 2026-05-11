import { Paperclip } from 'lucide-react'

import Action from '../components/Action'

export default function Upload(): React.JSX.Element {
  return <Action disabled icon={Paperclip} title="上传附件" />
}
